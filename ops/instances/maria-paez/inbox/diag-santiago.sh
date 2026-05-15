#!/bin/bash
# Diagnóstico de la conversación con Santiago Bignone — qué pasó con su calendar
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1) Estado del usuario Santiago Bignone ═══"
sqlite3 -header -column "$DB" "
SELECT id, nombre, calendar_id, calendar_acceso, tz, activo, creado, actualizado
FROM usuarios
WHERE nombre LIKE '%Bignone%'
"

echo ""
echo "═══ 2) Últimos eventos con Santiago (60 más recientes) ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, canal, direccion, substr(COALESCE(cuerpo,''),1,140) AS cuerpo
FROM eventos
WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre LIKE '%Bignone%')
ORDER BY id DESC LIMIT 60
" | tac

echo ""
echo "═══ 3) ¿Maria emitió alguna vez set_calendar_acceso para Santiago? ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, substr(cuerpo,1,200) AS cuerpo
FROM eventos
WHERE canal='sistema' AND (cuerpo LIKE '%set_calendar_acceso%' OR cuerpo LIKE '%calendar_acceso%')
ORDER BY id DESC LIMIT 20
"

echo ""
echo "═══ 4) Si chequearAccesoCalendar está siendo llamado en algún lado ═══"
grep -n "chequearAccesoCalendar" /root/secretaria/*.js 2>/dev/null | grep -v node_modules

echo ""
echo "═══ 5) Reglas del prompt que mencionen 'sistema', 'admin', 'operador', 'dueño' ═══"
grep -nE '(sistema|admin|operador|dueño del|tu creador|quien.*opera|Diego Páez)' /root/secretaria/prompt-builder.js | head -20
echo ""
grep -nE '(sistema|admin|operador|dueño)' /root/secretaria/instrucciones.txt 2>/dev/null

echo ""
echo "═══ 6) instrucciones.txt actual (es el [INSTRUCCIONES BASE] del prompt) ═══"
cat /root/secretaria/instrucciones.txt 2>/dev/null
