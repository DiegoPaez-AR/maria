#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ 1. Identidad de Rubén ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, wa_cus, wa_lid, rol FROM usuarios WHERE nombre LIKE '%Rub%' OR nombre LIKE '%Ward%';"

echo ""
echo "═══ 2. Eventos del enviar_wa a Rubén hoy con usuario_id ═══"
sqlite3 -header -column "$DB" <<'SQL'
SELECT id, timestamp, canal, direccion, de, usuario_id, substr(cuerpo,1,90) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-19 00:00:00'
  AND canal='whatsapp'
  AND (de LIKE '%54024727%' OR de = (SELECT wa_lid FROM usuarios WHERE nombre LIKE '%Rub%') OR de = (SELECT wa_cus FROM usuarios WHERE nombre LIKE '%Rub%'))
ORDER BY id ASC;
SQL

echo ""
echo "═══ 3. Mismo timeframe pero filtrado por usuario_id=ruben ═══"
sqlite3 -header -column "$DB" <<'SQL'
SELECT id, timestamp, canal, direccion, de, usuario_id, substr(cuerpo,1,90) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-19 00:00:00'
  AND canal='whatsapp'
  AND usuario_id = (SELECT id FROM usuarios WHERE nombre LIKE '%Rub%')
ORDER BY id ASC;
SQL

echo ""
echo "═══ 4. Y los del usuario_id=diego para mismo destinatario ═══"
sqlite3 -header -column "$DB" <<'SQL'
SELECT id, timestamp, direccion, de, usuario_id, substr(cuerpo,1,90) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-19 00:00:00'
  AND canal='whatsapp'
  AND direccion = 'saliente'
  AND usuario_id = 1
  AND de LIKE '%54024727%'
ORDER BY id ASC;
SQL

echo ""
echo "═══ 5. Buscar dónde se loggea el saliente de enviar_wa ═══"
grep -n "mem.log\|usuario_id\|direccion.*saliente" /root/secretaria/executor.js | head -20
echo "---"
echo "Función _enviarWA:"
awk '/_enviarWA|async function _enviarWA/,/^}/' /root/secretaria/executor.js | head -80
