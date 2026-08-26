#!/bin/bash
cd /root/secretaria
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("── Poch en la libreta ──")
poch=None
for r in db.execute("SELECT id,usuario_id,nombre,whatsapp,email FROM contactos WHERE nombre LIKE '%och%'"):
    print(' ',dict(r)); poch=r
print("\n── wa_outbox de hoy ──")
for r in db.execute("SELECT id,numero,estado,intentos,creado,entregado,substr(texto,1,70) t FROM wa_outbox WHERE creado >= datetime('now','-12 hours') ORDER BY id"):
    print(' ',dict(r))
print("\n── qué le pidió Diego a Maria hoy ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,150) c FROM eventos
   WHERE usuario_id=1 AND timestamp >= datetime('now','-6 hours')
     AND canal IN ('telegram','whatsapp','gmail') ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][11:16]} {r['canal'][:3]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── eventos que mencionan a Poch (24h, cualquier canal) ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,120) c FROM eventos
   WHERE timestamp >= datetime('now','-24 hours') AND (cuerpo LIKE '%och%' OR nombre LIKE '%och%') ORDER BY timestamp"""):
    print(f" {r['timestamp'][11:16]} {r['canal'][:4]} {r['direccion'][:3]} {(r['c'] or '').replace(chr(10),' ')}")
print("\n── acciones/fallos recientes ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,140) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-6 hours')
     AND (cuerpo LIKE '%acción%' OR cuerpo LIKE '%FALL%' OR cuerpo LIKE '%no pude%') ORDER BY timestamp"""):
    print(f" {r['timestamp'][11:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo "── teléfono: qué sirvió/envió hoy ──"
timeout 15 grep -E "\[MB|wa-outbox" /root/.pm2/logs/maria-paez-out.log | tail -12
echo LISTO
