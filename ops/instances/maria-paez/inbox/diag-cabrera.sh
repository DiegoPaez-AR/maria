#!/bin/bash
# Investigar por qué Maria no pudo enviar WA a La Cabrera Palermo
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1) Contacto La Cabrera en la libreta ═══"
sqlite3 -header -column "$DB" "
SELECT id, nombre, whatsapp, email, usuario_id, visibilidad, notas, creado
FROM contactos
WHERE nombre LIKE '%abrera%' OR whatsapp LIKE '%6820%' OR whatsapp LIKE '%4013%'
"

echo ""
echo "═══ 2) Eventos relacionados con La Cabrera ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, canal, direccion, substr(de||' '||nombre,1,30) AS quien,
       substr(COALESCE(cuerpo,''),1,140) AS cuerpo
FROM eventos
WHERE cuerpo LIKE '%Cabrera%' OR cuerpo LIKE '%6820%' OR cuerpo LIKE '%4013%' OR de LIKE '%6820%' OR de LIKE '%4013%'
  AND timestamp >= '2026-05-15 13:40'
ORDER BY id ASC
LIMIT 30
"

echo ""
echo "═══ 3) Logs pm2 con error de envío post 13:40 ═══"
pm2 logs maria-paez --lines 2000 --nostream 2>&1 | sed -n '/13:40/,$p' | grep -iE 'cabrera|6820|4013|enviar_wa|enviar falló|no pude mandar|destinatario|libreta|wid|registered|invalid_grant|calendar' | head -50

echo ""
echo "═══ 4) Acciones ejecutadas ventana 13:40-13:50 (canal sistema) ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, substr(cuerpo,1,200) AS cuerpo
FROM eventos
WHERE canal='sistema' AND direccion='interno'
  AND timestamp >= '2026-05-15 13:40' AND timestamp <= '2026-05-15 13:50'
ORDER BY id ASC
LIMIT 50
"
