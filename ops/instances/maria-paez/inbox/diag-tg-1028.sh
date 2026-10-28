#!/bin/bash
# Solo lectura: Telegram de Diego en dos ventanas (alta de Matías Israel 27/10 y Mónaco 28/10)
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), canal, direccion, replace(substr(cuerpo,1,700),char(10),' ⏎ '), case when cuerpo like 'acci%' then substr(coalesce(metadata_json,''),1,500) else '' end from eventos where ((timestamp between '2026-10-27 22:30' and '2026-10-27 23:30') or (timestamp between '2026-10-28 11:40' and '2026-10-28 11:55')) and cuerpo not like 'claude_call%' order by id;" )
