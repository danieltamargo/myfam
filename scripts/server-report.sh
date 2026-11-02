#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

if [[ ${1:-} == --help ]]; then
  printf 'Uso: sudo bash scripts/server-report.sh\nGenera un informe privado en /var/tmp. No instala ni modifica servicios.\n'
  exit 0
fi
[[ $# == 0 ]] || { printf 'No se admiten argumentos. Use --help.\n' >&2; exit 2; }
[[ $EUID == 0 && $(uname -s) == Linux ]] || {
  printf 'Ejecute este script con sudo en el VPS Linux.\n' >&2
  exit 1
}
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH

report_dir=$(mktemp -d /var/tmp/myfamily-server-report.XXXXXXXX)
report="$report_dir/report.txt"
exec 3>"$report"
chmod 600 "$report"

section() { printf '\n## %s\n' "$1" >&3; }
probe() {
  local result=0
  printf '\n$ %s\n' "$*" >&3
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'NO DISPONIBLE: %s\n' "$1" >&3
    return 0
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout 30 "$@" >&3 2>&1 || result=$?
  else
    "$@" >&3 2>&1 || result=$?
  fi
  if (( result != 0 )); then
    printf 'COMPROBACIÓN INCOMPLETA (código %s).\n' "$result" >&3
  fi
}

printf '# Informe MyFamily del VPS\nFecha UTC: %s\n' "$(date -u +%FT%TZ)" >&3
printf 'Solo lectura. No incluye entornos, claves, configuraciones ni argumentos de procesos.\n' >&3
printf 'Contiene IP, nombres de servicios, imágenes y rutas de montaje. Revíselo antes de compartirlo.\n' >&3

section 'Sistema operativo y virtualización'
if [[ -r /etc/os-release ]]; then
  # Read selected fields as text; never execute the OS metadata file.
  while IFS= read -r line; do
    case "$line" in NAME=*|VERSION=*|ID=*|ID_LIKE=*|PRETTY_NAME=*) printf '%s\n' "$line" >&3 ;; esac
  done < /etc/os-release
fi
probe uname -srmo
probe uptime
probe systemd-detect-virt
probe systemctl is-system-running
probe timedatectl show --property=Timezone --property=NTPSynchronized

section 'CPU y memoria'
probe lscpu
probe free -h
probe swapon --show --output=TYPE,SIZE,USED,PRIO
probe vmstat 1 3
probe ps -eo comm,pcpu,pmem,rss --sort=-rss
section 'Discos e inodos'
probe lsblk --output NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS
probe df -hT
probe df -hi
section 'Red y puertos en escucha'
probe ip -brief address
probe ip route show default
probe ss -lntup
section 'Servicios activos, habilitados y fallidos'
probe systemctl list-units --type=service --state=running --no-pager --plain
probe systemctl list-unit-files --type=service --state=enabled --no-pager
probe systemctl --failed --no-pager
section 'Tareas programadas'
probe systemctl list-timers --all --no-pager
printf '\nNo se leen crontabs: pueden contener credenciales. Revisar con el operador.\n' >&3
section 'Firewall'
probe ufw status verbose
probe firewall-cmd --list-all
printf '\nNo se vuelcan reglas completas: pueden contener comentarios privados.\n' >&3
section 'Docker: versiones, ocupación y contenedores'
probe docker version --format 'Cliente: {{.Client.Version}} Servidor: {{.Server.Version}}'
probe docker compose version
probe docker info --format 'Driver={{.Driver}} Cgroup={{.CgroupVersion}} CPUs={{.NCPU}} Memoria={{.MemTotal}} DockerRoot={{.DockerRootDir}}'
probe docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
probe docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'
probe docker system df
probe docker network ls --format 'table {{.Name}}\t{{.Driver}}\t{{.Scope}}'
probe docker volume ls --format 'table {{.Name}}\t{{.Driver}}'
section 'Herramientas de despliegue'
probe nginx -v
probe certbot --version
probe openssl version
probe node --version
probe git --version
section 'Limitaciones'
printf '%s\n' \
  'Las cifras son una instantánea, no una prueba de carga ni de capacidad futura.' \
  'No se consultan proveedores externos para descubrir la IP pública.' \
  'No se leen logs, configuraciones nginx, archivos .env, certificados, claves ni credenciales Docker.' \
  'Docker se consulta solo mediante el socket local convencional; rootless requiere revisión aparte.' \
  'El firewall local y los puertos en escucha no prueban accesibilidad desde Internet.' \
  'Confirmar con el operador dominios/DNS, SMTP, ventana de mantenimiento y servicios que deban preservarse.' \
  'Copias en este mismo VPS no cubren pérdida del servidor o del disco.' >&3
exec 3>&-
printf 'Informe generado (permisos 0600): %s\nRevíselo antes de compartirlo.\n' "$report"
