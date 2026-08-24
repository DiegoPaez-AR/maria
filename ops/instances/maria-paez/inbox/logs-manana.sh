#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo ""
echo "── señales del TELÉFONO desde anoche (¿se cortó en la mudanza?) ──"
timeout 20 grep -E "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -25
echo ""
echo "── latidos ──"
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler'), wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  teléfono:', min(wh.ultimoLatido()), '| gmail:', min(gh.ultimoLatidoGmail()));"
echo ""
echo "── errores desde medianoche ──"
timeout 15 grep "2026-08-24" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -15
echo ""
echo "── actividad desde medianoche ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT e.timestamp,e.canal,e.direccion,COALESCE(u.nombre,e.nombre,e.de) q,substr(e.cuerpo,1,100) c
   FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp >= '2026-08-24 03:00' AND e.canal IN ('whatsapp','telegram','gmail') ORDER BY e.timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {r['canal'][:3]} {f} {(r['q'] or '?')[:16]:<16} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── sistema desde medianoche ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,120) c FROM eventos
   WHERE timestamp >= '2026-08-24 03:00' AND canal='sistema'
     AND cuerpo NOT LIKE 'claude_call%' ORDER BY timestamp"""):
    print(f" {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
print("\n── wa_outbox pendiente ──")
for r in db.execute("SELECT id,numero,estado,intentos FROM wa_outbox WHERE estado NOT IN ('entregado','vencido') ORDER BY id DESC LIMIT 5"):
    print('  ', dict(r))
db.close()
PY
echo LISTO
