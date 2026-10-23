#!/bin/bash
# Solo lectura: por qué falló agregar_pendiente hoy (Farinelli, ensalada)
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  echo "── eventos hoy desde 13:30 ART ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), canal, direccion, replace(substr(cuerpo,1,400),char(10),' ⏎ '), substr(coalesce(metadata_json,''),1,900) from eventos where timestamp>='2026-10-23 16:30' and cuerpo not like 'claude_call%' order by id;"
  echo "── pendientes/outbox hoy ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, dueno, datetime(creado,'-3 hours'), substr(\"desc\",1,120), substr(coalesce(meta_json,''),1,300) from pendientes where creado>='2026-10-23 16:00' order by id;"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, numero, datetime(creado,'-3 hours'), datetime(entregado,'-3 hours'), substr(texto,1,120) from wa_outbox where creado>='2026-10-23 16:00';" )
echo "── logs ──"
grep -h -E "^2026-10-23 1[3-4]:" logs/maria-paez/out.log logs/maria-paez/error.log | grep -i -E "agregar|pendiente|fall|error|Error|executor|mcp|enviar_wa|wa-outbox" | sort | cut -c1-600 | tail -40
