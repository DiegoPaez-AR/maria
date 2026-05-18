#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
HOY=$(date +%Y-%m-%d)

echo "═══ pm2 status ═══"
pm2 jlist 2>/dev/null | python3 -c '
import sys, json, datetime
d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]
r=d[0] if d else None
if r:
    print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restarts:", r["pm2_env"]["restart_time"])
    print("arrancó:", datetime.datetime.fromtimestamp(r["pm2_env"]["pm_uptime"]/1000).isoformat())
'

echo ""
echo "═══ Restarts/boots desde 00:00 ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,120) FROM eventos WHERE timestamp >= '${HOY}' AND canal='sistema' AND (cuerpo LIKE '%arranc%' OR cuerpo LIKE '%shutdown%' OR cuerpo LIKE '%SIGINT%') ORDER BY timestamp ASC;"

echo ""
echo "═══ Resumen actividad por canal/dirección desde 00:00 ═══"
sqlite3 -header -column "$DB" "SELECT canal, direccion, COUNT(*) AS n FROM eventos WHERE timestamp >= '${HOY}' GROUP BY canal, direccion ORDER BY canal, direccion;"

echo ""
echo "═══ Mensajes entrantes WA por usuario desde 00:00 ═══"
sqlite3 -header -column "$DB" "
SELECT
  COALESCE(u.nombre, '(desconocido/tercero)') AS user,
  e.tipo_original AS tipo,
  COUNT(*) AS n
FROM eventos e
LEFT JOIN usuarios u ON u.id = e.usuario_id
WHERE e.timestamp >= '${HOY}' AND e.canal='whatsapp' AND e.direccion='entrante'
GROUP BY u.nombre, e.tipo_original
ORDER BY n DESC LIMIT 20;
"

echo ""
echo "═══ Acciones ejecutadas hoy (top tipos) ═══"
sqlite3 -header -column "$DB" "
SELECT
  REPLACE(REPLACE(substr(cuerpo, 19), ' ', ''), ':', '') AS accion,
  COUNT(*) AS n
FROM eventos
WHERE timestamp >= '${HOY}' AND canal='sistema' AND cuerpo LIKE 'acción ejecutada:%'
GROUP BY 1 ORDER BY n DESC LIMIT 20;
"

echo ""
echo "═══ Acciones FALLIDAS hoy ═══"
sqlite3 -header -column "$DB" "
SELECT datetime(timestamp), substr(cuerpo, 1, 200) AS msg
FROM eventos
WHERE timestamp >= '${HOY}' AND canal='sistema' AND cuerpo LIKE 'acción FALLÓ:%'
ORDER BY timestamp ASC LIMIT 30;
"

echo ""
echo "═══ Errores pm2 logs desde 00:00 (filtrados) ═══"
pm2 logs maria-paez --lines 3000 --nostream 2>&1 | grep -E "^0\|maria-pa | 2026-05-18" | grep -iE "error|fatal|SyntaxError|Timeout|killed|ABORTADO" | tail -40

echo ""
echo "═══ Llamadas Claude hoy (cuántas, tiempo, errores) ═══"
sqlite3 -header -column "$DB" "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN cuerpo NOT LIKE '%ERROR=%' THEN 1 ELSE 0 END) AS ok,
  SUM(CASE WHEN cuerpo LIKE '%ERROR=%' THEN 1 ELSE 0 END) AS errores,
  MIN(json_extract(metadata_json, '\$.ms')) AS min_ms,
  MAX(json_extract(metadata_json, '\$.ms')) AS max_ms,
  ROUND(AVG(json_extract(metadata_json, '\$.ms'))) AS avg_ms
FROM eventos
WHERE timestamp >= '${HOY}' AND canal='sistema' AND cuerpo LIKE 'claude_call%';
"

echo ""
echo "═══ Healthcheck actual ═══"
bash /root/secretaria/ops/healthcheck.sh | python3 -c '
import sys, json
d=json.load(sys.stdin)
print("overall_ok:", d["overall_ok"])
for k, v in d["checks"].items():
    print(f"  {k}: {v[\"ok\"]}")
'
