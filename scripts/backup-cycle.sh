#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# != 6 ]]; then
  echo 'Usage: backup-cycle.sh PROJECT COMPOSE_FILE COMPOSE_ENV SOURCES_JSON PASSWORD_FILE BACKUP_ROOT' >&2
  exit 2
fi
project=$1
compose_file=$2
compose_env=$3
sources=$4
password=$5
backup_root=$6
[[ $project =~ ^[a-z0-9][a-z0-9_-]+$ ]] || exit 2
mkdir -p "$backup_root"
exec 9>"$backup_root/.backup.lock"
flock -n 9 || { echo 'Another backup cycle is active' >&2; exit 1; }
compose=(docker compose --project-name "$project" --env-file "$compose_env" -f "$compose_file")
"${compose[@]}" config --quiet
readiness_timeout=${BACKUP_READY_TIMEOUT_SECONDS:-120}
[[ $readiness_timeout =~ ^[0-9]+$ ]] && (( readiness_timeout >= 1 && readiness_timeout <= 600 )) || exit 2
inventory=$(node scripts/backup-cycle-state.mjs snapshot "$project" "$sources")
mapfile -t running <<< "$inventory"

restart() {
  local status=$?
  trap - EXIT INT TERM
  local failed=0
  for id in "${running[@]}"; do
    if ! docker start "$id"; then
      echo 'Failed to restart a container; operator intervention required' >&2
      failed=1
    elif ! node scripts/backup-cycle-state.mjs ready "$id" "$readiness_timeout"; then
      failed=1
    fi
  done
  (( failed == 0 )) || exit 1
  exit "$status"
}
trap restart EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for (( index=${#running[@]}-1; index>=0; index-- )); do
  docker stop --time 120 "${running[index]}"
done
destination="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)"
node scripts/backup.mjs backup "$destination" "$password" "$sources"
node scripts/backup.mjs verify "$destination" "$password"
