#!/bin/bash
python3 << 'PY'
import sqlite3
db = sqlite3.connect('/root/secretaria/state/maria-paez/db/maria.sqlite')
print("COUNT por usuario_id (privados):")
for r in db.execute("SELECT usuario_id, COUNT(*) FROM contactos WHERE visibilidad='privada' GROUP BY usuario_id").fetchall(): print(' ', r)
print("\nCOUNT públicos:", db.execute("SELECT COUNT(*) FROM contactos WHERE visibilidad='publica'").fetchone()[0])
print("\nTOTAL:", db.execute("SELECT COUNT(*) FROM contactos").fetchone()[0])
print("\nPaez de Diego (id=1):")
for r in db.execute("SELECT id, nombre, whatsapp, email, cumple FROM contactos WHERE usuario_id=1 AND nombre LIKE '%Paez%' ORDER BY nombre").fetchall(): print(' ', r)
print("\nDiego (id=1) primeros 10 cumples del año:")
for r in db.execute("SELECT nombre, cumple FROM contactos WHERE usuario_id=1 AND cumple IS NOT NULL ORDER BY substr(cumple,-5) LIMIT 10").fetchall(): print(' ', r)
print("\n¿Hay duplicados de nombre por usuario en privada? (debería ser 0)")
for r in db.execute("SELECT usuario_id, nombre, COUNT(*) FROM contactos WHERE visibilidad='privada' GROUP BY usuario_id, nombre HAVING COUNT(*)>1").fetchall(): print(' ', r)
PY
