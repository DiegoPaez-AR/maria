#!/bin/bash
# 19/10 (aprobado Diego "vamos con todos"): cerrar #237/#239, dry-run del reporte semanal,
# ver crontab de reportes, lanzar build MariaBridge 4.11
cd /root/secretaria
echo "── HEAD desplegado ──"; git log --format='%h %s' -1; grep -c "salidaDiferida" executor.js wa-outbox.js
echo "── cerrar pendientes 237 / 239 ──"
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 "$MARIA_DB" "UPDATE pendientes SET estado='cerrado', cerrado=CURRENT_TIMESTAMP WHERE id IN (237,239) AND estado='abierto'; SELECT id, estado, cerrado, substr(\"desc\",1,60) FROM pendientes WHERE id IN (237,239);"
  sqlite3 "$MARIA_DB" "UPDATE follow_ups SET estado='cancelado' WHERE estado IN ('abierto','disparado') AND id IN (SELECT json_extract(meta_json,'\$.follow_up_id') FROM pendientes WHERE id IN (237,239));" 2>&1 )
echo "── crontab (reportes) ──"; crontab -l | grep -n -E "daily-report|weekly-review|resumen"
echo "── dry-run semanal ──"
timeout 150 env DRY_RUN=1 node daily-report.js --dias 7 --solo maria-paez,sofia-bruscoli --sin-funnel 2>&1 | sed -n '/PREVIEW/,/HTML LENGTH/p' | head -150
echo "── build MariaBridge 4.11 ──"
setsid bash /root/mb-build-worker.sh < /dev/null > /root/mariabridge-build.log 2>&1 &
echo "lanzado pid $!"
