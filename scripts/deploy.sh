#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ ${1:-} == --help ]]; then
  echo 'Usage: sudo bash scripts/deploy.sh [PATH_TO_ENV]'
  echo 'Interactive Linux installation/update with local Supabase, nginx HTTPS and private backups.'
  exit 0
fi
[[ $# -le 1 ]] || { echo 'Expected at most one environment file' >&2; exit 2; }
[[ $(uname -s) == Linux && $EUID == 0 ]] || { echo 'Run on the VPS with sudo bash scripts/deploy.sh' >&2; exit 1; }
command -v node >/dev/null || { echo 'Install Node.js 24 before continuing' >&2; exit 1; }
command -v flock >/dev/null || { echo 'Install util-linux before continuing' >&2; exit 1; }
exec 9>/run/lock/myfamily-guided-deploy.lock
flock -n 9 || { echo 'Another guided deployment is active' >&2; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
exec node scripts/deploy-guided.mjs "${1:-.env}"
