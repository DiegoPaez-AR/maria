#!/bin/bash
DB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
date
sqlite3 -header "$DB" "select * from wa_outbox" 2>&1 | head -5
echo "── últimas 12 líneas del log ──"
tail -12 /root/.pm2/logs/sofia-bruscoli-out.log
echo "── polls del teléfono (nginx) ──"
grep "wa-sofia-bruscoli" /var/log/nginx/access.log 2>/dev/null | tail -5 | cut -c1-160
echo LISTO
