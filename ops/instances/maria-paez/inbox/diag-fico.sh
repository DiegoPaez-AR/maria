#!/bin/bash
cd /root/secretaria
echo "── TODO lo que vio el bridge entre 19:40 y 20:05 ──"
timeout 20 awk '/2026-08-22 19:4[0-9]|2026-08-22 20:0[0-5]/' /root/.pm2/logs/maria-paez-out.log | grep -E "\[MB|wa-hook|wa-outbox|entrante" | head -40
echo ""
echo "── entrantes de WhatsApp registrados hoy después de las 19:00 ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,de,nombre,substr(cuerpo,1,80) c FROM eventos
   WHERE canal='whatsapp' AND direccion='entrante' AND timestamp >= datetime('now','-1 day')
   ORDER BY timestamp DESC LIMIT 15"""):
    print(' ',r['timestamp'],'|',r['nombre'] or r['de'],'|',(r['c'] or '').replace('\n',' '))
print("\n── outbox 239 (el mensaje a Fico) ──")
for r in db.execute("SELECT id,numero,estado,creado,entregado,substr(texto,1,60) t FROM wa_outbox WHERE id>=238"):
    print(' ',dict(r))
print("\n── gestiones/follow-ups abiertos ──")
try:
    for r in db.execute("""SELECT id,desc,dueno,disparador,esperando_de,estado FROM pendientes
        WHERE estado='abierto' AND esperando_de IS NOT NULL LIMIT 10"""):
        print(' ',dict(r))
except Exception as e: print('  (', e, ')')
db.close()
PY
echo ""
echo "── notificaciones descartadas por los filtros del bridge ──"
timeout 15 grep -E "\[MB.*(descart|filtr|dedupe|sin acción|eco|vacío)" /root/.pm2/logs/maria-paez-out.log | tail -15
echo LISTO
