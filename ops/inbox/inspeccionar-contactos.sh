#!/bin/bash
# Diagnostico: ver schema de tabla contactos + filas de Diego (usuario_id=1).
# Buscamos especificamente a Santiago / Chino para entender por que el lookup
# no matcheo el @lid de Santiago.
DB=/root/secretaria/db/maria.sqlite

echo "═══ schema contactos ═══"
sqlite3 "$DB" '.schema contactos'

echo ""
echo "═══ contactos de Diego (id=1) ═══"
sqlite3 -header -column "$DB" \
  "SELECT id, nombre, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email, COALESCE(notas,'') AS notas FROM contactos WHERE usuario_id=1 ORDER BY nombre LIMIT 80"

echo ""
echo "═══ contactos donde nombre LIKE '%santi%' o '%chino%' (cualquier usuario) ═══"
sqlite3 -header -column "$DB" \
  "SELECT id, usuario_id, nombre, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email FROM contactos WHERE nombre LIKE '%santi%' OR nombre LIKE '%Santi%' OR nombre LIKE '%chino%' OR nombre LIKE '%Chino%'"

echo ""
echo "═══ eventos del @lid 144036744671299 (lo que vio Maria) ═══"
sqlite3 -header -column "$DB" \
  "SELECT id, timestamp, direccion, substr(COALESCE(cuerpo,''),1,80) AS cuerpo FROM eventos WHERE de='144036744671299@lid' OR para='144036744671299@lid' ORDER BY id DESC LIMIT 10"

echo ""
echo "═══ prospectos pendientes activos (whatsapp) ═══"
sqlite3 -header -column "$DB" \
  "SELECT id, canal, remitente_id, COALESCE(nombre_sugerido,'') AS sugerido, ts, COALESCE(estado,'') AS estado FROM prospectos_pendientes WHERE canal='whatsapp' ORDER BY id DESC LIMIT 10" 2>&1
