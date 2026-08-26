#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
AYER=$(date -d yesterday '+%Y-%m-%d')
echo "── errores de ayer ($AYER) ──"
timeout 20 grep "^$AYER" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -vE "poll error" | tail -15
echo "  cortes de TG (poll error): $(timeout 10 grep -c \"^$AYER.*poll error\" /root/.pm2/logs/maria-paez-error.log 2>/dev/null)"
echo "── fallos/avisos out.log ──"
timeout 20 grep "^$AYER" /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "FALLO|no pude|abort|descart|prosa|acción #" | tail -12
echo "── actividad + costo de ayer (UTC aprox) ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
from datetime import datetime,timedelta
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
# "ayer" local ≈ ayer 03:00 UTC a hoy 03:00 UTC
hoy=datetime.utcnow().strftime('%Y-%m-%d')
ayer=(datetime.utcnow()-timedelta(days=1)).strftime('%Y-%m-%d')
d0, d1 = f"{ayer} 03:00", f"{hoy} 03:00"
for r in db.execute("""SELECT canal, SUM(direccion='entrante') e, SUM(direccion='saliente') s
   FROM eventos WHERE timestamp>=? AND timestamp<? AND canal IN ('whatsapp','telegram','gmail') GROUP BY canal""",(d0,d1)):
    print(f"  {r['canal']:<10} in={r['e'] or 0:<4} out={r['s'] or 0}")
print("  costo:")
tot=0
for r in db.execute("""SELECT json_extract(metadata_json,'$.canal') c, COUNT(*) n,
     SUM(json_extract(metadata_json,'$.cost_usd')) usd FROM eventos
   WHERE timestamp>=? AND timestamp<? AND json_extract(metadata_json,'$.cost_usd') IS NOT NULL
   GROUP BY c ORDER BY usd DESC""",(d0,d1)):
    print(f"   {str(r['c'] or '-'):<16} {r['n']:>3}t  US$ {r['usd'] or 0:.2f} (${(r['usd'] or 0)/max(r['n'],1):.3f}/t)")
    tot+=r['usd'] or 0
print(f"   TOTAL                 US$ {tot:.2f}")
print("  quién escribió:")
for r in db.execute("""SELECT COALESCE(u.nombre,e.nombre,e.de) q, COUNT(*) n FROM eventos e
   LEFT JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp>=? AND e.timestamp<? AND e.direccion='entrante'
     AND e.canal IN ('whatsapp','telegram','gmail') GROUP BY q ORDER BY n DESC""",(d0,d1)):
    print(f"   {(r['q'] or '?')[:24]:<24} {r['n']}")
print("  sistema (hitos, no claude_call):")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,120) c FROM eventos
   WHERE timestamp>=? AND timestamp<? AND canal='sistema'
     AND cuerpo NOT LIKE 'claude_call%' AND cuerpo NOT LIKE 'acción ejecutada%' ORDER BY timestamp""",(d0,d1)):
    print(f"   {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo "── teléfono: RECUPEROs acumulados / latidos ──"
timeout 10 grep -c "RECUPERO" /root/.pm2/logs/maria-paez-out.log 2>/dev/null
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler'), wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  teléfono:', min(wh.ultimoLatido()), '| gmail:', min(gh.ultimoLatidoGmail()));"
echo LISTO
