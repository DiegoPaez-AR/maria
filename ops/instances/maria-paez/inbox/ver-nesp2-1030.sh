#!/bin/bash
# Solo lectura: nuevo descarte de Nespresso después de las 08:50
cd /root/secretaria
git log --format='%h %ci %s' -1 -- wa-hook.js; grep -c "_cubre" wa-hook.js
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), canal, direccion, coalesce(nombre,de,''), replace(substr(cuerpo,1,500),char(10),' ⏎ '), substr(coalesce(metadata_json,''),1,300) from eventos where timestamp >= '2026-10-30 11:50' and cuerpo not like 'claude_call%' order by id;"
  echo "── contactos nespresso ──"; sqlite3 "$MARIA_DB" "select id, usuario_id, nombre, whatsapp from contactos where lower(nombre) like '%nespresso%';"
  echo "── join outbox 24h ──"; sqlite3 "$MARIA_DB" "SELECT DISTINCT c.id, c.nombre, c.whatsapp, o.numero FROM contactos c JOIN wa_outbox o ON replace(replace(COALESCE(c.whatsapp,''),'@c.us',''),'+','') LIKE '%' || substr(o.numero, -10) WHERE o.creado >= datetime('now','-24 hours') AND c.whatsapp IS NOT NULL;" )
grep -E "^2026-10-30 0(8:5|9:)" logs/maria-paez/out.log logs/maria-paez/error.log | grep -i -E "nespresso|wa-hook|notif\] entrante|descart|error" | cut -c1-300 | tail -20
sed -n '/const _confiable/,/+3p' wa-hook.js | head -5
