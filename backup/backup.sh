#!/bin/sh
# Backup automatico del database Hospardo (gira nel servizio "backup" di docker-compose).
#   BACKUP_TIME        ora del backup giornaliero, formato HH:MM (default 02:30)
#   BACKUP_KEEP_DAYS   giorni di conservazione dei backup (default 30)
#   BACKUP_ON_START    "true" = fa un backup anche all'avvio del servizio (default true)
# Backup manuale immediato:  docker compose exec backup sh /backup.sh now

TIME="${BACKUP_TIME:-02:30}"
KEEP="${BACKUP_KEEP_DAYS:-30}"

do_backup() {
  name="hospardo-$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump -h db -U postgres -Fc -f "/backups/$name.tmp" hospardo; then
    mv "/backups/$name.tmp" "/backups/$name"
    echo "$(date '+%Y-%m-%d %H:%M') Backup creato: $name ($(du -h "/backups/$name" | cut -f1))"
    find /backups -name 'hospardo-*.dump' -mtime +"$KEEP" -print -delete | sed 's/^/  eliminato backup vecchio: /'
  else
    rm -f "/backups/$name.tmp"
    echo "$(date '+%Y-%m-%d %H:%M') ERRORE: backup non riuscito" >&2
    return 1
  fi
}

if [ "${1:-}" = "now" ]; then
  do_backup
  exit $?
fi

echo "Backup automatico attivo: ogni giorno alle $TIME, conservazione $KEEP giorni, cartella /backups"
[ "${BACKUP_ON_START:-true}" = "true" ] && do_backup

while true; do
  now=$(date +%s)
  next=$(date -d "today $TIME" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow $TIME" +%s)
  echo "Prossimo backup: $(date -d "@$next" '+%Y-%m-%d %H:%M')"
  sleep $((next - now))
  do_backup
done
