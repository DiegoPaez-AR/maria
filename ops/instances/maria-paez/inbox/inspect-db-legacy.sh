#!/bin/bash
set +e
LEGACY="/root/secretaria/db/maria.sqlite"

echo "═══ Existe la DB legacy? ═══"
ls -la "$LEGACY" 2>&1

echo ""
echo "═══ ¿Está open por algún proceso? ═══"
lsof "$LEGACY" 2>&1 | head -10

echo ""
echo "═══ Tablas y últimos cambios ═══"
sqlite3 "$LEGACY" ".tables" 2>&1
echo ""
sqlite3 -header -column "$LEGACY" "SELECT 'usuarios:' || COUNT(*) FROM usuarios UNION ALL SELECT 'eventos:' || COUNT(*) FROM eventos UNION ALL SELECT 'contactos:' || COUNT(*) FROM contactos UNION ALL SELECT 'estado_usuario:' || COUNT(*) FROM estado_usuario;" 2>&1

echo ""
echo "═══ Último evento (timestamp) ═══"
sqlite3 "$LEGACY" "SELECT MAX(timestamp) FROM eventos;" 2>&1
echo ""
sqlite3 -header -column "$LEGACY" "SELECT datetime(timestamp), canal, substr(cuerpo,1,80) FROM eventos ORDER BY timestamp DESC LIMIT 5;" 2>&1

echo ""
echo "═══ Usuarios en la legacy ═══"
sqlite3 -header -column "$LEGACY" "SELECT id, nombre, wa_cus, activo FROM usuarios;" 2>&1

echo ""
echo "═══ ¿Hay diferencia con state/_old? ═══"
ls -la /root/secretaria/state/_old/ 2>&1 | head -10
