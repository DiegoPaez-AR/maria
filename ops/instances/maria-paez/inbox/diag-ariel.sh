#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

echo "═══ 1) Eventos con Ariel / Volkswagen / VW / Taos ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, direccion, substr(COALESCE(de,'')||' '||COALESCE(nombre,''),1,40) AS quien,
       substr(COALESCE(cuerpo,''),1,160) AS cuerpo
FROM eventos
WHERE (cuerpo LIKE '%Ariel%' OR cuerpo LIKE '%Volkswagen%' OR cuerpo LIKE '%VW%' OR cuerpo LIKE '%Taos%' OR nombre LIKE '%Ariel%')
  AND timestamp >= '2026-05-16'
ORDER BY id DESC LIMIT 30
"

echo ""
echo "═══ 2) Contactos con nombre/notas que contengan Ariel ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, nombre, whatsapp, email, usuario_id, visibilidad, substr(COALESCE(notas,''),1,80) AS notas
FROM contactos
WHERE nombre LIKE '%Ariel%' OR notas LIKE '%Ariel%' OR notas LIKE '%VW%' OR notas LIKE '%Volkswagen%' OR notas LIKE '%Taos%'
"

echo ""
echo "═══ 3) Errores 'validarDestinatario' o 'no está en libreta' recientes ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, substr(cuerpo,1,200) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-16'
  AND (cuerpo LIKE '%no está en libreta%' OR cuerpo LIKE '%validarDestinatario%' OR cuerpo LIKE '%enviar_wa%FALLARON%' OR cuerpo LIKE '%enviar_wa:%')
ORDER BY id DESC LIMIT 20
"

echo ""
echo "═══ 4) Mensaje original entrante de Ariel a Maria ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, direccion, de, substr(cuerpo,1,200) AS cuerpo
FROM eventos
WHERE direccion='entrante' AND canal='whatsapp'
  AND timestamp >= '2026-05-16'
  AND (cuerpo LIKE '%Honda%' OR cuerpo LIKE '%Volkswagen%' OR cuerpo LIKE '%cotizaci%' OR cuerpo LIKE '%Taos%' OR cuerpo LIKE '%concesionari%' OR de NOT LIKE '34342575317160%')
ORDER BY id DESC LIMIT 15
"

echo ""
echo "═══ 5) Texto de cuestionario o ficha que Maria intentó mandar ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, direccion, substr(cuerpo,1,260) AS cuerpo
FROM eventos
WHERE canal='whatsapp'
  AND timestamp >= '2026-05-16 22:00'
  AND (cuerpo LIKE '%ficha%' OR cuerpo LIKE '%mandarla%' OR cuerpo LIKE '%cotizaci%' OR cuerpo LIKE '%bloquea%' OR cuerpo LIKE '%no pude mandar%')
ORDER BY id DESC LIMIT 20
"
