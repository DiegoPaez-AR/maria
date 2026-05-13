#!/bin/bash
set -u
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1. Eventos que mencionan el ID 105171031949561 (cualquier campo) ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, nombre,
    substr(COALESCE(cuerpo,''),1,200) AS cuerpo,
    substr(COALESCE(metadata_json,''),1,400) AS meta
  FROM eventos
  WHERE de LIKE '%105171031949561%' OR cuerpo LIKE '%105171031949561%' OR metadata_json LIKE '%105171031949561%'
  ORDER BY id DESC LIMIT 15;"

echo
echo "═══ 2. Eventos que mencionan el número 5491144471264 ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, nombre,
    substr(COALESCE(cuerpo,''),1,200) AS cuerpo,
    substr(COALESCE(metadata_json,''),1,400) AS meta
  FROM eventos
  WHERE de LIKE '%5491144471264%' OR cuerpo LIKE '%5491144471264%' OR metadata_json LIKE '%5491144471264%'
  ORDER BY id DESC LIMIT 15;"

echo
echo "═══ 3. Eventos usuario_id=6 (Doris) ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, nombre,
    substr(COALESCE(cuerpo,''),1,200) AS cuerpo,
    substr(COALESCE(metadata_json,''),1,300) AS meta
  FROM eventos
  WHERE usuario_id=6
  ORDER BY id DESC LIMIT 20;"

echo
echo "═══ 4. Cualquier evento con 'Doris' en cuerpo o metadata o nombre ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, de, nombre,
    substr(COALESCE(cuerpo,''),1,200) AS cuerpo,
    substr(COALESCE(metadata_json,''),1,300) AS meta
  FROM eventos
  WHERE cuerpo LIKE '%Doris%' OR metadata_json LIKE '%Doris%' OR nombre LIKE '%Doris%'
  ORDER BY id DESC LIMIT 15;"

echo
echo "═══ 5. Esquema y datos de contactos relacionados con Doris/Capurro ═══"
sqlite3 "$DB" "PRAGMA table_info(contactos);"
echo "---rows---"
sqlite3 -line "$DB" "SELECT * FROM contactos WHERE nombre LIKE '%Doris%' OR nombre LIKE '%Capurro%' LIMIT 5;"

echo
echo "═══ 6. Cualquier registro en hechos relacionado con Doris ═══"
sqlite3 -line "$DB" "SELECT clave, valor, fuente FROM hechos WHERE valor LIKE '%Doris%' OR clave LIKE '%Doris%' OR clave LIKE '%doris%' LIMIT 5;"

echo
echo "═══ 7. Buscar 1051710319 o 5491144 en TODOS los campos de TODAS las tablas (no exhaustivo) ═══"
for tabla in eventos contactos hechos pendientes estado_usuario estado programados usuarios; do
  echo "--- $tabla ---"
  sqlite3 "$DB" "SELECT * FROM $tabla WHERE CAST(rowid AS TEXT) IN (SELECT rowid FROM $tabla LIMIT 0)" >/dev/null 2>&1 || continue
  # Dump rows que matcheen 105171031949561 o 5491144471264 escaneando cada columna texto
  python3 - "$tabla" <<'PY'
import sqlite3, sys
tabla = sys.argv[1]
conn = sqlite3.connect('/root/secretaria/state/maria-paez/db/maria.sqlite')
c = conn.cursor()
cols = [r[1] for r in c.execute(f"PRAGMA table_info({tabla})").fetchall()]
where = " OR ".join([f"CAST({col} AS TEXT) LIKE '%105171031949561%' OR CAST({col} AS TEXT) LIKE '%5491144471264%'" for col in cols])
try:
    rows = c.execute(f"SELECT * FROM {tabla} WHERE {where} LIMIT 5").fetchall()
    if rows:
        for r in rows:
            print(dict(zip(cols, [str(x)[:200] for x in r])))
    else:
        print("  (sin matches)")
except Exception as e:
    print("  err:", e)
PY
done
