#!/bin/bash
cd /root/secretaria
set -a; . config/instances/sofia-bruscoli.conf; . config/secrets.conf 2>/dev/null; set +a
DB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
echo "── usuarios ──"; sqlite3 "$DB" "select id,nombre,email,whatsapp,telegram_chat_id,idioma,created_at from usuarios" 2>&1 | head
echo "── eventos (todo lo que hubo con Noelia / salidas) ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),tipo,de,substr(cuerpo,1,140) from eventos order by timestamp desc limit 15" 2>&1
echo "── mails salidos según log ──"
grep -iE "enviarEmail|mail enviado|bienvenid|nbruscoli" /root/.pm2/logs/sofia-bruscoli-out.log | tail -8
echo "── ¿existe bienvenida en el código? ──"
grep -rn "bienvenid" --include=*.js -il . 2>/dev/null | grep -v node_modules | head
echo LISTO
