#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== tráfico por canal (últimos 3 días) =="
sqlite3 "$DB" "SELECT date(timestamp), canal, direccion, COUNT(*) FROM eventos WHERE timestamp > datetime('now','-3 days') AND canal IN ('whatsapp','telegram','gmail') GROUP BY 1,2,3 ORDER BY 1 DESC, 2;"
echo "== fallas/errores registrados (48h) =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,95) FROM eventos WHERE timestamp > datetime('now','-48 hours') AND canal='sistema' AND (cuerpo LIKE '%falló%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%FALLO%' OR cuerpo LIKE '%no pude%') ORDER BY id DESC LIMIT 12;"
echo "== wa-hook: desconocidos/ambiguos (48h) =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,80) FROM eventos WHERE metadata_json LIKE '%wa_hook%' AND timestamp > datetime('now','-48 hours') ORDER BY id DESC LIMIT 6;"
echo "== cola de salientes =="
sqlite3 "$DB" "SELECT id, estado, intentos, substr(texto,1,30) FROM wa_outbox ORDER BY id DESC LIMIT 5;"
echo "== deadline hits (48h) =="
grep -a "wa-hook] deadline" /root/.pm2/logs/maria-paez-out.log 2>/dev/null | tail -4
echo "== errores pm2 recientes =="
grep -aiE "error|falló|FALLO" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -8
echo "== túnel oficina =="
ss -tlnp | grep -qE ':1080' && echo "1080 OK" || echo "1080 CAÍDO"
ss -tlnp | grep -qE ':2222' && echo "2222 OK" || echo "2222 CAÍDO"
