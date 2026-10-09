#!/bin/bash
cd /root/secretaria
echo "══ semana en curso: review parcial de las dos (5-9/10) ══"
timeout 100 node ops/scripts/weekly-review.js --dias 5 --no-mail 2>&1 | grep -vE "^\s*$" | head -5
for S in maria-paez sofia-bruscoli; do echo "### $S"; f=ops/instances/$S/reviews/$(ls ops/instances/$S/reviews | tail -1); grep -E "^\*\*(Usuarios|Gasto)" $f; sed -n '/### Quién escribió/,/### Acciones ejecutadas/p' $f | grep "^|" | grep -vE "^\| ---|quién" | head -6; sed -n '/### Acciones FALLIDAS/,/### Follow-ups/p' $f | grep "^|" | grep -vE "^\| ---|cuándo|estado \|" | cut -c1-230; sed -n '/### error.log/,$p' $f | grep "^|" | grep -vE "^\| ---|^\| n " | cut -c1-160 | head -14; done
echo "══ HOY: el mensaje al restaurante ══"
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,230) from eventos where date(timestamp,'-3 hours')='2026-10-09' and canal!='sistema' and cuerpo not like '☀️%' order by timestamp"
echo "-- sistema hoy --"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),substr(replace(cuerpo,char(10),' '),1,230) from eventos where date(timestamp,'-3 hours')='2026-10-09' and canal='sistema' and cuerpo not like 'claude_call%' and cuerpo not like '%memoria-curada%' order by timestamp"
sqlite3 "$DB" "select id,datetime(creado,'-3 hours'),numero,estado,intentos,substr(metadata_json,1,300) from wa_outbox where date(creado,'-3 hours')='2026-10-09'"
echo "-- MB log hoy --"
grep -hE "^2026-10-09" logs/maria-paez/out.log | grep -E "\[MB|MB-|outbox" | grep -vE "barrido|al día|latido" | cut -c1-220
echo LISTO
