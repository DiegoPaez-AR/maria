#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo "── errores 24h (agrupados) ──"
timeout 20 awk -v d="$(date -u -d '24 hours ago' '+%Y-%m-%d %H:%M')" '$0 >= d' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -15
echo "── fallos/avisos en out.log ──"
timeout 20 awk -v d="$(date -d '24 hours ago' '+%Y-%m-%d %H:%M')" '$0 >= d' /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "FALLO|no pude|abort|descart|huérfan|error|warn" | grep -viE "politica_v4|poll error" | tail -15
echo "── actividad por canal (24h) + costo ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT canal, SUM(direccion='entrante') e, SUM(direccion='saliente') s
   FROM eventos WHERE timestamp >= datetime('now','-24 hours') AND canal IN ('whatsapp','telegram','gmail') GROUP BY canal"""):
    print(f"  {r['canal']:<10} in={r['e'] or 0:<4} out={r['s'] or 0}")
print("  costo por canal:")
for r in db.execute("""SELECT json_extract(metadata_json,'$.canal') c, COUNT(*) n,
     SUM(json_extract(metadata_json,'$.cost_usd')) usd
   FROM eventos WHERE timestamp >= datetime('now','-24 hours')
     AND json_extract(metadata_json,'$.cost_usd') IS NOT NULL GROUP BY c ORDER BY usd DESC"""):
    print(f"   {str(r['c'] or '-'):<14} {r['n']:>3}t  US$ {r['usd'] or 0:.2f}  (${(r['usd'] or 0)/max(r['n'],1):.3f}/t)")
print("  conversaciones (entrantes de usuarios):")
for r in db.execute("""SELECT u.nombre, COUNT(*) n FROM eventos e JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp >= datetime('now','-24 hours') AND e.direccion='entrante'
     AND e.canal IN ('whatsapp','telegram','gmail') GROUP BY u.nombre ORDER BY n DESC"""):
    print(f"   {r['nombre']:<20} {r['n']}")
print("  sistema (no claude_call):")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,110) c FROM eventos
   WHERE timestamp >= datetime('now','-24 hours') AND canal='sistema'
     AND cuerpo NOT LIKE 'claude_call%' ORDER BY timestamp DESC LIMIT 12"""):
    print(f"   {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo "── teléfono / barrido / latidos ──"
timeout 15 grep -E "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -5
timeout 15 grep -cE "RECUPERO" /root/.pm2/logs/maria-paez-out.log
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler'), wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  teléfono:', min(wh.ultimoLatido()), '| gmail:', min(gh.ultimoLatidoGmail()));"
echo "── ¿algún pausado volvió? ──"
timeout 15 node -e "const u=require('/root/secretaria/usuarios'); console.log('  pausados:', u.listarPausados().map(x=>x.nombre).join(', ')||'ninguno');"
echo LISTO
