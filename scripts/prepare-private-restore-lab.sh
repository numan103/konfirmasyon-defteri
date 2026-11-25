#!/usr/bin/env bash
# Provision only the newly created, private Debian WSL restore lab.
set -euo pipefail
test "$(id -u)" = 0
test -f /etc/debian_version
test -f /mnt/v/ALFA-Backups/alfa-20261125T163349Z.dump
# Prevent packages starting a database accessible outside the private lab.
if test -e /usr/sbin/policy-rc.d; then
  echo "Existing service-start policy: refusing to replace it." >&2
  exit 1
fi
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod 755 /usr/sbin/policy-rc.d
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  postgresql-17 postgresql-contrib-17 postgresql-server-dev-17 \
  build-essential libsodium-dev ca-certificates git python3
test -f /usr/share/postgresql/17/extension/pgcrypto.control
test -f /usr/share/postgresql/17/extension/uuid-ossp.control
test -f /usr/share/postgresql/17/extension/pg_stat_statements.control
mkdir -p /opt/alfa-restore
test ! -e /opt/alfa-restore/vault
git clone https://github.com/supabase/vault.git /opt/alfa-restore/vault
cd /opt/alfa-restore/vault
git checkout --detach v0.3.2
git rev-parse HEAD > /mnt/v/ALFA-Backups/vault-build-commit.txt
make PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config
make PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config install
test -f /usr/share/postgresql/17/extension/supabase_vault.control
# The WSL distro's VHDX is in the encrypted container; disable unencrypted swap
# before any production archive is restored. This is a newly installed WSL VM.
swapoff -a
test "$(wc -l < /proc/swaps)" -eq 1
unshare --net -- sh -c 'test "$(awk -F: "NR>2 {gsub(/ /,\"\",\$1); print \$1}" /proc/net/dev)" = lo'
echo "Private restore prerequisites prepared; no production data restored yet."
