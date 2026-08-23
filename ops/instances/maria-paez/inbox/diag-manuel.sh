#!/bin/bash
cd /root/secretaria
echo "── qué vio el teléfono al intentar el envío a Manuel ──"
timeout 20 grep -E "2026-08-23.*(MB-FALLO|chat_equivocado|frio|abriendo chat|chat abierto|541155771290)" /root/.pm2/logs/maria-paez-out.log | tail -25
echo ""
echo "── el registro #241 y el número que se sirvió ──"
timeout 25 python3 - <<'PY'
import sqlite3,os,json
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("SELECT * FROM wa_outbox WHERE id>=240 ORDER BY id"):
    d=dict(r); d['texto']=(d.get('texto') or '')[:70]
    print(' ',d)
print("\n── Manuel en la libreta ──")
for r in db.execute("SELECT id,usuario_id,nombre,whatsapp,email FROM contactos WHERE lower(nombre) LIKE '%manuel%' OR lower(nombre) LIKE '%carrasco%'"):
    print(' ',dict(r))
print("\n── follow-ups de Manuel ──")
for r in db.execute("""SELECT id,desc,dueno,disparador,estado,recordar_desde,metadata FROM pendientes
   WHERE lower(COALESCE(desc,'')) LIKE '%manuel%' ORDER BY id DESC LIMIT 8"""):
    d=dict(r); d['desc']=(d.get('desc') or '')[:80]; d['metadata']=(d.get('metadata') or '')[:150]
    print(' ',d)
db.close()
PY
echo LISTO
