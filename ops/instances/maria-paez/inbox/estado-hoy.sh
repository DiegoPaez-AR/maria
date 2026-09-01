#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo "── errores desde el domingo 22:30 ──"
timeout 20 awk '$0 >= "2026-08-30 22:30"' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -15
echo "── fallos/avisos ──"
timeout 20 awk '$0 >= "2026-08-30 22:30"' /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "FALLO|no pude|abort|descart|RECUPERO|prosa|dormidos|pausado" | tail -12
echo "── actividad desde el domingo ──"
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT date(timestamp) d, COUNT(*) n, SUM(json_extract(metadata_json,'$.cost_usd')) usd
   FROM eventos WHERE tipo='claude_call' AND timestamp >= '2026-08-31' GROUP BY d"""):
    print(f"  {r['d']}: {r['n']} turnos  US$ {(r['usd'] or 0):.2f}")
print("  conversaciones:")
for r in db.execute("""SELECT COALESCE(u.nombre,e.nombre,e.de) q, SUM(e.direccion='entrante') i, SUM(e.direccion='saliente') o
   FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp >= '2026-08-31 03:00' AND e.canal IN ('whatsapp','telegram','gmail')
   GROUP BY q ORDER BY i+o DESC LIMIT 8"""):
    print(f"   {(r['q'] or '?')[:24]:<24} in={r['i'] or 0:<3} out={r['o'] or 0}")
print("  hitos de sistema:")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,130) c FROM eventos
   WHERE canal='sistema' AND timestamp >= '2026-08-31 03:00'
     AND cuerpo NOT LIKE 'claude_call%' AND cuerpo NOT LIKE 'acción ejecutada%' AND cuerpo NOT LIKE '%meeting-prep%'
   ORDER BY timestamp DESC LIMIT 12"""):
    print(f"   {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo "── latidos / barrido / canary ──"
timeout 10 grep -c "RECUPERO" /root/.pm2/logs/maria-paez-out.log
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler'), wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  teléfono:', min(wh.ultimoLatido()), '| gmail:', min(gh.ultimoLatidoGmail()));"
cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ CANARY MALO" || echo "  canary limpio"
echo LISTO
