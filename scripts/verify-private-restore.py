"""Verify only the network-isolated, local restore database. Never production."""
import collections
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone

BASE = pathlib.Path("/mnt/v/ALFA-Backups")
DB = "alfa_restore_20261125"
BIN = pathlib.Path("/usr/lib/postgresql/17/bin")
ENV = dict(os.environ, PGHOST="/tmp/alfa-private-socket-v3", PGPORT="55432",
           PGUSER="supabase_admin", PGDATABASE=DB)


def psql(sql):
    process = subprocess.run(
        [str(BIN / "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
        input=sql.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV)
    if process.returncode:
        # Errors may include data; keep them inside the encrypted volume.
        with (BASE / "restore-verification-errors.log").open("ab") as log:
            log.write(process.stderr)
        raise RuntimeError("Local verification query failed; private log saved.")
    return process.stdout


def row_fingerprint(rows):
    hashes = sorted(hashlib.sha256(row).digest() for row in rows)
    return {"rows": len(hashes),
            "sha256": hashlib.sha256(b"".join(hashes)).hexdigest()}


def schema_lines(text):
    # Catalog ordering and random psql restriction tokens may differ.
    # Preserve all non-comment SQL lines (including function bodies and grants).
    lines = []
    for line in text.splitlines():
        if not line.strip() or line.startswith(("--", "\\restrict ", "\\unrestrict ")):
            continue
        if line.startswith("CREATE POLICY "):
            # pg_dump prints policy role lists by role OID, not semantic order.
            match = re.search(r" TO ([a-zA-Z_0-9, ]+?)( USING | WITH CHECK |;)", line)
            if match:
                roles = ", ".join(sorted(r.strip() for r in match[1].split(",")))
                line = line[:match.start(1)] + roles + line[match.end(1):]
        lines.append(line.rstrip())
    return collections.Counter(lines)


def main():
    # /sys may retain the parent namespace's mount; /proc/net is per-process.
    interfaces = {line.split(":")[0].strip()
                  for line in pathlib.Path("/proc/net/dev").read_text().splitlines()[2:]}
    if interfaces != {"lo"}:
        raise RuntimeError("Verification requires an isolated network namespace.")
    identity = psql("SELECT current_database(), inet_server_addr() IS NULL;").decode().strip()
    if identity != DB + "|t":
        raise RuntimeError("Restore target identity mismatch.")

    expected = {}
    table = None
    rows = []
    with (BASE / "restore-data-review.sql").open("rb") as archive:
        for raw in archive:
            line = raw.rstrip(b"\r\n")
            if table is None:
                match = re.match(rb"^COPY (.+) \(.+\) FROM stdin;$", line)
                if match:
                    table = match[1].decode()
                    rows = []
            elif line == b"\\.":
                expected[table] = row_fingerprint(rows)
                table = None
            else:
                rows.append(line)
    if table is not None or len(expected) != 80:
        raise RuntimeError("Archive table baseline incomplete.")

    checks = {}
    for name, fingerprint in expected.items():
        # Names originate from pg_restore, but still restrict them before SQL use.
        if not re.fullmatch(r'(?:[a-zA-Z_][a-zA-Z_0-9]*|"[^"]+")[.]'
                            r'(?:[a-zA-Z_][a-zA-Z_0-9]*|"[^"]+")', name):
            raise RuntimeError("Unexpected qualified table identifier.")
        content = psql(
            "SET timezone='UTC'; SET datestyle='ISO'; SET intervalstyle='postgres'; "
            "SET extra_float_digits=3; SET bytea_output='hex'; "
            f"COPY {name} TO STDOUT;")
        actual = row_fingerprint(content.splitlines())
        checks[name] = {"count_matches": actual["rows"] == fingerprint["rows"],
                        "content_matches": actual["sha256"] == fingerprint["sha256"]}

    restored_schema = BASE / "restored-schema.sql"
    with (BASE / "restore-verification-errors.log").open("ab") as errors:
        process = subprocess.run(
            [str(BIN / "pg_dump"), "--schema-only", "--file=" + str(restored_schema)],
            env=ENV, stdout=subprocess.DEVNULL, stderr=errors)
    if process.returncode:
        raise RuntimeError("Local restored schema export failed.")
    source_schema = (BASE / "restore-schema-review.sql").read_text()
    original = schema_lines(source_schema)
    restored = schema_lines(restored_schema.read_text())
    schema_matches = original == restored
    # Any discrepancy remains BLOCKED, never silently waive ACL or RLS differences.
    (BASE / "restore-schema-difference.json").write_text(json.dumps({
        "missing": list((original - restored).elements()),
        "extra": list((restored - original).elements())
    }, indent=2))
    invalid_indexes = int(psql(
        "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname NOT IN ('pg_catalog','information_schema') "
        "AND (NOT i.indisvalid OR NOT i.indisready);").decode())
    unvalidated_constraints = int(psql(
        "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace "
        "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND NOT c.convalidated;"
    ).decode())
    source_unvalidated_constraints = len(re.findall(r"NOT VALID;", source_schema))

    # Compare only catalog metadata captured from production. No user rows,
    # password hashes, tokens or secrets are read or written by this check.
    metadata_query = """
SELECT jsonb_build_object(
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion,
   'owner',pg_get_userbyid(extowner))) FROM pg_extension),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,
   'bypassrls',rolbypassrls,'inherit',rolinherit,'createrole',rolcreaterole,
   'createdb',rolcreatedb)) FROM pg_roles WHERE rolname NOT LIKE 'pg_%'),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),
   'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),
   'admin',admin_option,'inherit',inherit_option,'set',set_option))
   FROM pg_auth_members),
 'database',(SELECT jsonb_build_object('collate',datcollate,'ctype',datctype)
   FROM pg_database WHERE datname=current_database())
)::text;
"""
    local = json.loads(psql(metadata_query).decode())
    source = json.loads((BASE / "alfa-restore-source-metadata.json").read_text())
    def tuples(rows, keys):
        return {tuple(row[key] for key in keys) for row in rows}
    role_keys = ("name", "superuser", "bypassrls", "inherit", "createrole", "createdb")
    extension_keys = ("name", "version", "owner")
    # Grantor is excluded: the isolated bootstrap role cannot safely attribute
    # memberships to supabase_admin without altering ADMIN option metadata.
    membership_keys = ("role", "member", "admin", "inherit", "set")
    source_role_names = {r["name"] for r in source["roles"]}
    local_roles = [r for r in local["roles"] if r["name"] in source_role_names]
    source_extensions = [e for e in source["extensions"]]
    local_extensions = [e for e in local["extensions"] if e["name"] in {x["name"] for x in source_extensions}]
    local_memberships = [m for m in local["memberships"]
                         if (m["role"], m["member"]) in {
                             (x["role"], x["member"]) for x in source["memberships"]}]
    metadata_checks = {
        "extensions_match": tuples(local_extensions, extension_keys) == tuples(source_extensions, extension_keys),
        "role_attributes_match": tuples(local_roles, role_keys) == tuples(source["roles"], role_keys),
        "role_memberships_match": tuples(local_memberships, membership_keys) == tuples(source["memberships"], membership_keys),
        "database_locale_match": local["database"] == source["database"],
    }
    report = {
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "target": DB,
        "network_isolated": True,
        "tables_checked": len(checks),
        "table_checks": checks,
        "schema_rls_acl_owner_lines_match": schema_matches,
        "invalid_indexes": invalid_indexes,
        "unvalidated_constraints": unvalidated_constraints,
        "source_unvalidated_constraints": source_unvalidated_constraints,
        "catalog_metadata_checks": metadata_checks,
        "scope": "Logical database archive; not cluster passwords, Storage bytes or external integrations",
        "status": "PASS" if schema_matches and invalid_indexes == 0
                  and unvalidated_constraints == source_unvalidated_constraints
                  and all(all(c.values()) for c in checks.values())
                  and all(metadata_checks.values()) else "BLOCKED"
    }
    (BASE / "isolated-restore-evidence.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in [
        "status", "tables_checked", "schema_rls_acl_owner_lines_match",
        "invalid_indexes", "unvalidated_constraints", "network_isolated",
        "catalog_metadata_checks"]}))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("BLOCKED: " + str(error), file=sys.stderr)
        sys.exit(1)
