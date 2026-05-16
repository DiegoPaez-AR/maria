#!/bin/bash
# Resumen del dia de Maria (15-may-2026)
set +e
set -a
. /root/secretaria/config/instances/maria-paez.conf
set +a

HOY="2026-05-15"

echo "═══ 1) Actividad WA por usuario (entrantes + salientes hoy) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT
  COALESCE(u.nombre, '(no-user)') AS usuario,
  SUM(CASE WHEN e.direccion='entrante' THEN 1 ELSE 0 END) AS recibidos,
  SUM(CASE WHEN e.direccion='saliente' THEN 1 ELSE 0 END) AS enviados
FROM eventos e
LEFT JOIN usuarios u ON u.id = e.usuario_id
WHERE e.canal='whatsapp' AND e.timestamp >= '$HOY'
GROUP BY u.nombre
ORDER BY (recibidos+enviados) DESC
"

echo ""
echo "═══ 2) Gmail hoy ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT direccion, COUNT(*) AS n
FROM eventos
WHERE canal='gmail' AND timestamp >= '$HOY'
GROUP BY direccion
"

echo ""
echo "═══ 3) Eventos de calendar creados hoy ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, usuario_id, substr(cuerpo,1,140) AS cuerpo
FROM eventos
WHERE canal='calendar' AND direccion='saliente' AND timestamp >= '$HOY'
ORDER BY id
"

echo ""
echo "═══ 4) Acciones ejecutadas hoy (sistema interno) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT
  SUBSTR(cuerpo, INSTR(cuerpo,'acción ejecutada: ')+18) AS accion,
  COUNT(*) AS n
FROM eventos
WHERE canal='sistema' AND cuerpo LIKE '%acción ejecutada:%' AND timestamp >= '$HOY'
GROUP BY accion
ORDER BY n DESC
"

echo ""
echo "═══ 5) Errores/falls hoy (excluyendo invalid_grant historicos pre-reauth) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT timestamp, substr(cuerpo,1,160) AS cuerpo
FROM eventos
WHERE canal='sistema' AND timestamp >= '$HOY'
  AND (cuerpo LIKE '%falló%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%FALLARON%')
  AND cuerpo NOT LIKE '%invalid_grant%'
ORDER BY id DESC LIMIT 20
"

echo ""
echo "═══ 6) Pendientes nuevos hoy ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, estado, creado, substr(desc,1,80) AS descripcion
FROM pendientes
WHERE creado >= '$HOY'
ORDER BY id
"

echo ""
echo "═══ 7) Hechos modificados o agregados hoy ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT clave, substr(valor,1,80) AS valor, actualizado
FROM hechos
WHERE actualizado >= '$HOY'
ORDER BY actualizado DESC
"

echo ""
echo "═══ 8) Resumen ejecutivo ═══"
TOT_WA_IN=$(sqlite3 "$MARIA_DB" "SELECT COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp>='$HOY'")
TOT_WA_OUT=$(sqlite3 "$MARIA_DB" "SELECT COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp>='$HOY'")
TOT_GMAIL=$(sqlite3 "$MARIA_DB" "SELECT COUNT(*) FROM eventos WHERE canal='gmail' AND timestamp>='$HOY'")
TOT_CAL=$(sqlite3 "$MARIA_DB" "SELECT COUNT(*) FROM eventos WHERE canal='calendar' AND timestamp>='$HOY'")
TOT_CLAUDE=$(sqlite3 "$MARIA_DB" "SELECT COUNT(*) FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%claude_call%' AND timestamp>='$HOY'")
echo "  WA recibidos:     $TOT_WA_IN"
echo "  WA enviados:      $TOT_WA_OUT"
echo "  Gmail eventos:    $TOT_GMAIL"
echo "  Calendar eventos: $TOT_CAL"
echo "  Llamadas Claude:  $TOT_CLAUDE"
echo ""
echo "  pm2 status:"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys, time
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    up_ms = e.get('pm_uptime', 0)
    up_s = (time.time()*1000 - up_ms) / 1000
    h = int(up_s/3600); m = int((up_s%3600)/60)
    print(f\"    pid={p.get('pid')} status={e.get('status')} restarts={e.get('restart_time')} uptime={h}h{m}m\")
"
