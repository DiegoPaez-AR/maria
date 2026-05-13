#!/bin/bash
set -u
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1. Eventos que mencionan el ID 105171031949561 (en cualquier campo) ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, substr(COALESCE(cuerpo,''),1,200) AS cuerpo, substr(COALESCE(metadata,''),1,300) AS metadata
  FROM eventos
  WHERE de LIKE '%105171031949561%' OR cuerpo LIKE '%105171031949561%' OR metadata LIKE '%105171031949561%'
  ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 2. Eventos que mencionan el número 5491144471264 ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, substr(COALESCE(cuerpo,''),1,200) AS cuerpo, substr(COALESCE(metadata,''),1,300) AS metadata
  FROM eventos
  WHERE de LIKE '%5491144471264%' OR cuerpo LIKE '%5491144471264%' OR metadata LIKE '%5491144471264%'
  ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 3. Eventos usuarioId=6 (Doris) — todos los canales ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, substr(COALESCE(cuerpo,''),1,200) AS cuerpo, substr(COALESCE(metadata,''),1,200) AS metadata
  FROM eventos
  WHERE usuario_id=6
  ORDER BY id DESC LIMIT 15;"

echo
echo "═══ 4. Cualquier evento con 'Doris' en cuerpo (últimos 15) ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, substr(COALESCE(cuerpo,''),1,200) AS cuerpo, substr(COALESCE(metadata,''),1,200) AS metadata
  FROM eventos
  WHERE cuerpo LIKE '%Doris%' OR metadata LIKE '%Doris%'
  ORDER BY id DESC LIMIT 15;"

echo
echo "═══ 5. Esquema de eventos ═══"
sqlite3 "$DB" "PRAGMA table_info(eventos);"

echo
echo "═══ 6. Cualquier evento entrante (direccion='entrante') con LID que empiece similar ═══"
sqlite3 -header -column "$DB" "SELECT id, timestamp, de FROM eventos WHERE direccion='entrante' AND de LIKE '%@lid' GROUP BY de ORDER BY MAX(id) DESC LIMIT 20;"

echo
echo "═══ 7. ¿Existe tabla contactos? ¿Hay registro de Doris ahí? ═══"
sqlite3 "$DB" ".tables"
echo "---"
sqlite3 -line "$DB" "SELECT * FROM contactos WHERE nombre LIKE '%Doris%' OR datos LIKE '%capurro%' OR datos LIKE '%4447%' LIMIT 5;" 2>&1 || true
