#!/bin/bash
cd /root/secretaria
echo "── últimos turnos de Diego (TG) ──"
timeout 25 python3 -c "
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute(\"SELECT timestamp,direccion,substr(cuerpo,1,150) c FROM eventos WHERE usuario_id=1 AND canal='telegram' AND timestamp >= datetime('now','-2 hours') ORDER BY timestamp\"):
    f='→' if r['direccion']=='entrante' else '←'
    print(f\" {r['timestamp'][11:16]} {f} {(r['c'] or '').replace(chr(10),' | ')}\")
db.close()"
echo "── ¿llegó la tarjeta de Ward? contacto actualizado? ──"
timeout 20 node -e "
const mem=require('/root/secretaria/memory');
mem.db.prepare(\"SELECT id,usuario_id,nombre,whatsapp,email FROM contactos WHERE nombre LIKE '%Ward%'\").all().forEach(c=>console.log(' ',JSON.stringify(c)));"
echo "── wa_outbox reciente ──"
timeout 20 node -e "
const mem=require('/root/secretaria/memory');
mem.db.prepare(\"SELECT id,numero,estado,creado,substr(texto,1,60) t FROM wa_outbox ORDER BY id DESC LIMIT 4\").all().forEach(r=>console.log(' ',JSON.stringify(r)));"
echo "── logs TG del último rato ──"
timeout 15 grep -E "TG|vCard|CONTACTO" /root/.pm2/logs/maria-paez-out.log | tail -8
echo LISTO
