#!/usr/bin/env bash
# Never accepts a remote target or production connection string.
set -euo pipefail
base=/mnt/v/ALFA-Backups
bin=/usr/lib/postgresql/17/bin
cluster=/var/lib/alfa-private-restore-v3
socket=/tmp/alfa-private-socket-v3
db=alfa_restore_20261125
scripts=/mnt/c/Users/Pc/AppData/Local/Temp/opencode/alfa-telegram-mobile-edu-deploy/scripts
test "$(id -u)" = 0
test -f "$base/alfa-20261125T163349Z.dump"
test -f "$base/alfa-restore-source-metadata.json"
test -f /usr/share/postgresql/17/extension/supabase_vault.control
# Never let restored production rows reach an unencrypted Linux swap file.
swapoff -a
test "$(wc -l < /proc/swaps)" -eq 1
if test "${1:-}" != --offline; then
  # All database startup, restore and verification happen without network.
  exec unshare --net --fork bash "$0" --offline
fi
test "$(awk -F: 'NR>2 {gsub(/ /,"",$1); print $1}' /proc/net/dev)" = lo
test ! -e "$cluster"
test ! -e "$socket"
mkdir -m 700 "$cluster" "$socket"
chown postgres:postgres "$cluster" "$socket"
python3 - <<'PY'
import hashlib, json, pathlib
base = pathlib.Path("/mnt/v/ALFA-Backups")
archive = base / "alfa-20261125T163349Z.dump"
manifest = json.loads((base / (archive.name + ".manifest.json")).read_text(encoding="utf-8-sig"))
assert hashlib.sha256(archive.read_bytes()).hexdigest().upper() == manifest["sha256"]
print("Private archive checksum confirmed.")
PY
runuser -u postgres -- "$bin/initdb" -D "$cluster" -U supabase_admin \
  --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=en_US.UTF-8 \
  > "$base/restore-initdb.log" 2>&1
runuser -u postgres -- "$bin/pg_ctl" -D "$cluster" \
  -l "$cluster/server.log" \
  -o "-k $socket -p 55432 -c listen_addresses='' -c wal_level=logical -c shared_preload_libraries=pg_stat_statements -c log_statement=none -c log_min_error_statement=panic" \
  -w start > "$base/restore-start.log" 2>&1
cleanup() {
  runuser -u postgres -- "$bin/pg_ctl" -D "$cluster" -m fast -w stop \
    >> "$base/restore-stop.log" 2>&1 || true
}
trap cleanup EXIT
export PGHOST="$socket" PGPORT=55432 PGUSER=supabase_admin PGDATABASE=postgres
unset PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
"$bin/createdb" --template=template0 "$db"
export PGDATABASE="$db"
python3 - <<'PY'
import json, pathlib, re, subprocess
base = pathlib.Path("/mnt/v/ALFA-Backups")
schema = (base / "restore-schema-review.sql").read_text()
metadata = json.loads((base / "alfa-restore-source-metadata.json").read_text())
source_roles = {r["name"]: r for r in metadata["roles"]}
roles = set(source_roles)
roles.update(re.findall(r"(?m)OWNER TO ([A-Za-z_][A-Za-z_0-9]*);", schema))
roles.update(re.findall(r"ALTER DEFAULT PRIVILEGES FOR ROLE ([A-Za-z_][A-Za-z_0-9]*)", schema))
for line in schema.splitlines():
    if line.startswith(("GRANT ", "REVOKE ")):
        match = re.search(r" (?:TO|FROM) (.+?)(?: WITH GRANT OPTION)?;", line)
        if match:
            for value in match[1].split(","):
                value = value.strip()
                if re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", value):
                    roles.add(value)
roles.discard("PUBLIC")
roles.update(["anon", "authenticated", "service_role", "authenticator"])
existing = subprocess.run(
    ["/usr/lib/postgresql/17/bin/psql", "-X", "-qAt", "-c",
     "SELECT rolname FROM pg_roles"], stdout=subprocess.PIPE,
    stderr=subprocess.PIPE, check=True).stdout.decode().split()

def flag(name, value):
    return name if value else "NO" + name

sql = ""
for role in sorted(roles - set(existing)):
    # Login credentials are intentionally NOT restored or created.
    attrs = source_roles.get(role, {})
    flags = "NOLOGIN"
    for key, name in (("superuser", "SUPERUSER"), ("bypassrls", "BYPASSRLS"),
                      ("createdb", "CREATEDB"), ("createrole", "CREATEROLE"),
                      ("inherit", "INHERIT")):
        flags += " " + flag(name, bool(attrs.get(key, key == "inherit")))
    sql += f'CREATE ROLE "{role}" {flags};\n'
for membership in metadata["memberships"]:
    target = f'"{membership["role"]}" TO "{membership["member"]}"'
    admin = " WITH ADMIN OPTION" if membership["admin"] else ""
    inherited = "TRUE" if membership["inherit"] else "FALSE"
    settable = "TRUE" if membership["set"] else "FALSE"
    # PostgreSQL 17 accepts one membership option per GRANT statement.
    # Grantor identity is intentionally not preserved: the isolated bootstrap
    # role cannot attribute grants to another role without changing its ADMIN
    # options and invalidating production-equivalent membership records.
    sql += f'GRANT {target}{admin};\n'
    sql += f'GRANT {target} WITH INHERIT {inherited};\n'
    sql += f'GRANT {target} WITH SET {settable};\n'
with (base / "restore-roles.log").open("wb") as log:
    result = subprocess.run(
        ["/usr/lib/postgresql/17/bin/psql", "-X", "-v", "ON_ERROR_STOP=1"],
        input=sql.encode(), stdout=log, stderr=log)
assert result.returncode == 0, "Local role preparation failed; see private log"
PY
test "$("$bin/psql" -X -qAt -c "SELECT current_database(), inet_server_addr() IS NULL;")" = "$db|t"
# Temporary privileges are required only for extension creation in this offline lab.
"$bin/psql" -X -q -v ON_ERROR_STOP=1 \
  -c 'ALTER ROLE postgres SUPERUSER;' \
  -c 'ALTER ROLE supabase_admin SUPERUSER;'
# Render a SQL restore so extension owner and version can match source metadata
# without changing any user rows.
"$bin/pg_restore" --file="$base/restore-full.sql" "$base/alfa-20261125T163349Z.dump"
python3 - <<'PY'
import pathlib
base = pathlib.Path("/mnt/v/ALFA-Backups")
path = base / "restore-full.sql"
sql = path.read_text()
versions = {
    "pg_stat_statements WITH SCHEMA extensions;":
        "pg_stat_statements WITH SCHEMA extensions VERSION '1.11';",
    "pgcrypto WITH SCHEMA extensions;":
        "pgcrypto WITH SCHEMA extensions VERSION '1.3';",
    "supabase_vault WITH SCHEMA vault;":
        "supabase_vault WITH SCHEMA vault VERSION '0.3.2';",
    '"uuid-ossp" WITH SCHEMA extensions;':
        '"uuid-ossp" WITH SCHEMA extensions VERSION \'1.1\';',
}
for old, new in versions.items():
    full = "CREATE EXTENSION IF NOT EXISTS " + old
    replacement = "CREATE EXTENSION IF NOT EXISTS " + new
    assert sql.count(full) == 1, "Unexpected extension statement count"
    owner = "supabase_admin" if "supabase_vault" in old else "postgres"
    sql = sql.replace(full, f"SET ROLE {owner};\n{replacement}\nRESET ROLE;")
path.write_text(sql)
PY
if ! "$bin/psql" -X -q -v ON_ERROR_STOP=1 --single-transaction \
    -f "$base/restore-full.sql" \
    > "$base/restore-output.log" 2> "$base/restore-errors.log"; then
  echo "BLOCKED: restore failed. Details retained only in encrypted storage." >&2
  exit 1
fi
# Restore used temporary superuser privileges for extension initialization.
# supabase_admin keeps a local socket-only login for verification; no password.
"$bin/psql" -X -q -v ON_ERROR_STOP=1 \
  -c 'ALTER ROLE postgres NOSUPERUSER BYPASSRLS CREATEDB CREATEROLE INHERIT;' \
  -c 'ALTER ROLE supabase_admin LOGIN SUPERUSER BYPASSRLS CREATEDB CREATEROLE INHERIT;'
echo "Isolated SQL restore exited successfully; verifying archive data and schema."
python3 "$scripts/verify-private-restore.py"
