#!/bin/bash
# Investigar la conversación con Gabriel (+54 9 11 4040-2319) hoy ~13:34-13:41.
# Buscar: mensajes entrantes/salientes + claude_calls + ¿hubo debounce?
set +e

DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1) Mensajes entrantes y salientes con Gabriel (1140402319) ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, canal, direccion, substr(COALESCE(de,'')||COALESCE(nombre,''),1,40) AS contacto,
       substr(COALESCE(cuerpo,''),1,120) AS cuerpo
FROM eventos
WHERE (de LIKE '%1140402319%' OR cuerpo LIKE '%1140402319%' OR cuerpo LIKE '%4040-2319%' OR cuerpo LIKE '%Gabriel%' OR cuerpo LIKE '%gap2612%')
  AND timestamp >= '2026-05-15 13:00'
ORDER BY id ASC
LIMIT 80
"

echo ""
echo "═══ 2) Eventos en la ventana 13:30-13:45 (todos los canales) ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, canal, direccion, substr(COALESCE(de,'')||' '||COALESCE(nombre,''),1,30) AS quien,
       substr(COALESCE(cuerpo,''),1,90) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-15 13:30' AND timestamp <= '2026-05-15 13:45'
ORDER BY id ASC
LIMIT 100
"

echo ""
echo "═══ 3) Buscar el wa_id real de Gabriel en eventos (LID o c.us) ═══"
sqlite3 "$DB" "
SELECT DISTINCT de FROM eventos
WHERE timestamp >= '2026-05-15 13:30' AND timestamp <= '2026-05-15 13:45'
  AND canal='whatsapp'
"

echo ""
echo "═══ 4) Logs pm2 alrededor de la conversación (filtro Gabriel/4040) ═══"
pm2 logs maria-paez --lines 2000 --nostream 2>&1 | grep -E '4040-2319|1140402319|Gabriel|debounce|debouncing|WA_DEBOUNCE|gap2612|La Cabrera|cabrera' -i | tail -50

echo ""
echo "═══ 5) Eventos 'sistema interno' con razonamiento/claude_call cercanos ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, substr(COALESCE(cuerpo,''),1,160) AS cuerpo
FROM eventos
WHERE canal='sistema' AND direccion='interno'
  AND timestamp >= '2026-05-15 13:30' AND timestamp <= '2026-05-15 13:45'
ORDER BY id ASC
LIMIT 50
"

echo ""
echo "═══ 6) Contactos con Gabriel ═══"
sqlite3 -header -column "$DB" "
SELECT id, nombre, whatsapp, email, usuario_id, visibilidad
FROM contactos
WHERE nombre LIKE '%Gabriel%' OR whatsapp LIKE '%1140402319%' OR email LIKE '%gap2612%'
" 2>&1
