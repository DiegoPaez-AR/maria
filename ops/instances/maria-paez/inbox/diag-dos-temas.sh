#!/bin/bash
cd /root/secretaria
echo "════ TEMA 1: la reunión con Manuel Carrasco y Fulco — ¿quién dijo Meet? ════"
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("── mensajes con Manuel Carrasco (5 días, cualquier canal) ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,160) c FROM eventos
   WHERE (de LIKE '%155771290%' OR nombre LIKE '%Carrasco%' OR de LIKE '%manucarrasco%')
     AND timestamp >= datetime('now','-5 days') ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {r['canal'][:4]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── eventos de calendario que mencionan Manuel/Fulco (acciones) ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,200) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-7 days')
     AND (cuerpo LIKE '%Carrasco%' OR cuerpo LIKE '%Manuel%' OR cuerpo LIKE '%meet%' OR cuerpo LIKE '%Meet%')
   ORDER BY timestamp"""):
    print(f" {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
print("\n════ TEMA 2: Fulco pidió reunión con Ruben Ward y Diego ════")
print("── TODO lo de Hernan Fulco (3 días) ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,180) c FROM eventos
   WHERE usuario_id=(SELECT id FROM usuarios WHERE nombre='Hernan Fulco')
     AND timestamp >= datetime('now','-3 days') AND canal IN ('whatsapp','telegram','gmail')
   ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {r['canal'][:4]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── menciones de Ward/Ruben (7 días, todos los canales+sistema) ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,180) c FROM eventos
   WHERE timestamp >= datetime('now','-7 days') AND (cuerpo LIKE '%Ward%' OR cuerpo LIKE '%Ruben%' OR cuerpo LIKE '%Rubén%')
   ORDER BY timestamp"""):
    print(f" {r['timestamp'][5:16]} {r['canal'][:4]} {r['direccion'][:3]} {(r['c'] or '').replace(chr(10),' ')}")
print("\n── pendientes/follow-ups de Fulco ──")
for r in db.execute("""SELECT id,desc,dueno,estado,creado FROM pendientes
   WHERE usuario_id=(SELECT id FROM usuarios WHERE nombre='Hernan Fulco') ORDER BY id DESC LIMIT 8"""):
    print(' ',dict(r))
db.close()
PY
echo LISTO
