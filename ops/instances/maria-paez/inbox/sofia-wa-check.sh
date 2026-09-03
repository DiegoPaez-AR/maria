#!/bin/bash
DB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
sqlite3 -header "$DB" "select id,numero,estado,intentos,no_antes,enviado_en,error from wa_outbox" 2>&1 | head
grep -E "\[MB|wa-outbox|outbox" /root/.pm2/logs/sofia-bruscoli-out.log | tail -8
echo LISTO
