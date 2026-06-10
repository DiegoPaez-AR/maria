#!/bin/bash
# inbox: diagnostico v2 (columna correcta: "desc")
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.row_factory = sqlite3.Row

print("== 1. pendientes de Cristian Ruiz (id=9, no cerrados) ==")
for p in db.execute('SELECT id, dueno, disparador, "desc", estado, creado, recordar_desde, ultimo_recordatorio, meta_json FROM pendientes WHERE usuario_id=9 AND estado=\'abierto\''):
    print(dict(p)); print("---")

print("\n== follow-ups de Cristian (abiertos/disparados) ==")
for f in db.execute("SELECT id, descripcion, esperando_de, esperando_canal, vence_en, estado, creado FROM follow_ups WHERE usuario_id=9 AND estado IN ('abierto','disparado')"):
    print(dict(f))

print("\n== ultimos 15 eventos del bucket de Cristian ==")
for e in db.execute("SELECT id, timestamp, canal, direccion, de, substr(cuerpo,1,180) AS cuerpo FROM eventos WHERE usuario_id=9 ORDER BY id DESC LIMIT 15"):
    print(dict(e)); print("---")

print("\n== 2. eventos con 'dario' (ultimas 96h) ==")
for e in db.execute("""SELECT id, timestamp, usuario_id, canal, direccion, de, substr(cuerpo,1,300) AS cuerpo, substr(metadata_json,1,400) AS meta
                       FROM eventos
                       WHERE (cuerpo LIKE '%dario%' COLLATE NOCASE OR metadata_json LIKE '%dario%' COLLATE NOCASE OR nombre LIKE '%dario%' COLLATE NOCASE)
                         AND timestamp >= datetime('now','-96 hours') ORDER BY id"""):
    print(dict(e)); print("---")

print("\n== acciones calendar (ultimas 96h) ==")
for e in db.execute("""SELECT id, timestamp, usuario_id, substr(cuerpo,1,250) AS cuerpo, substr(metadata_json,1,500) AS meta
                       FROM eventos WHERE canal='calendar' AND timestamp >= datetime('now','-96 hours') ORDER BY id"""):
    print(dict(e)); print("---")

print("\n== contactos 'dario' ==")
for c in db.execute("SELECT id, usuario_id, nombre, whatsapp, email, visibilidad FROM contactos WHERE nombre LIKE '%dario%' COLLATE NOCASE"):
    print(dict(c))
PYEOF
