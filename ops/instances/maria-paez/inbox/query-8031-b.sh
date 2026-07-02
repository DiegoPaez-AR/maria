#!/bin/bash
DB="$MARIA_DB"
echo "== schema =="
sqlite3 -readonly "$DB" ".schema eventos" 2>&1
sqlite3 -readonly "$DB" ".schema contactos" 2>&1
echo "== eventos 8031 (full) =="
sqlite3 -readonly "$DB" -line "SELECT * FROM eventos WHERE rowid IN (SELECT rowid FROM eventos WHERE CAST(quote(quien) AS TEXT) LIKE '%1123348031%' OR texto LIKE '%1123348031%') ORDER BY id;" 2>&1 | head -c 20000
echo "== contactos full =="
sqlite3 -readonly "$DB" -line "SELECT * FROM contactos WHERE nombre LIKE '%caseros%' COLLATE NOCASE OR nombre LIKE '%chalaca%' COLLATE NOCASE;" 2>&1
