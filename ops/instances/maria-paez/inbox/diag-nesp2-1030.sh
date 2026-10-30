#!/bin/bash
# Solo lectura: envío #309 a Nespresso (número hogar) 30/10
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, intentos, numero, datetime(creado,'-3 hours'), datetime(entregado,'-3 hours'), substr(coalesce(metadata_json,''),1,500) from wa_outbox where id>=309;"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), canal, direccion, replace(substr(cuerpo,1,600),char(10),' ⏎ ') from eventos where timestamp >= '2026-10-30 11:09' and cuerpo not like 'claude_call%' order by id;"
  sqlite3 "$MARIA_DB" "select id, nombre, whatsapp from contactos where id in (618,619);" )
grep -h "^2026-10-30 08:[0-5]" logs/maria-paez/out.log | grep -E "frio|MB-FALLO|wa-outbox|MB-VERIF|ctl|notif\] entrante|wa-hook" | cut -c1-300 | tail -40
