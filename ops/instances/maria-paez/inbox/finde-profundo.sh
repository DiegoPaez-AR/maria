#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo ""
echo "════ ERRORES desde el viernes 28/8 18:00 ════"
timeout 20 awk '$0 >= "2026-08-28 18:00"' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -vE "fetch failed" | tail -20
echo "  fetch-failed TG en el período: $(timeout 10 awk '$0 >= \"2026-08-28 18:00\"' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -c 'fetch failed')"
echo ""
echo "════ FALLOS/AVISOS del out.log ════"
timeout 25 awk '$0 >= "2026-08-28 18:00"' /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "FALLO|no pude|abort|descart|prosa|RECUPERO|CANARY|huérfan" | tail -15
echo ""
echo "════ ACTIVIDAD + COSTO por día ════"
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for d in ('2026-08-28','2026-08-29','2026-08-30'):
    r=db.execute("""SELECT COUNT(*) n, SUM(json_extract(metadata_json,'$.cost_usd')) usd
       FROM eventos WHERE tipo='claude_call' AND date(timestamp)=?""",(d,)).fetchone()
    e=db.execute("""SELECT SUM(direccion='entrante') i, SUM(direccion='saliente') o FROM eventos
       WHERE date(timestamp)=? AND canal IN ('whatsapp','telegram','gmail')""",(d,)).fetchone()
    print(f"  {d}: {r['n'] or 0} turnos  US$ {(r['usd'] or 0):.2f}  | in={e['i'] or 0} out={e['o'] or 0}")
print("\n════ CONVERSACIONES del finde (in/out por persona) ════")
for r in db.execute("""SELECT COALESCE(u.nombre,e.nombre,e.de) q, SUM(e.direccion='entrante') i, SUM(e.direccion='saliente') o
   FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp >= '2026-08-28 21:00' AND e.canal IN ('whatsapp','telegram','gmail')
   GROUP BY q ORDER BY i+o DESC LIMIT 10"""):
    print(f"   {(r['q'] or '?')[:26]:<26} in={r['i'] or 0:<3} out={r['o'] or 0}")
print("\n════ LA GESTIÓN WARD: ¿Diego pasó la tarjeta? ¿salió el WA? ════")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,140) c FROM eventos
   WHERE timestamp >= '2026-08-28 21:00' AND (cuerpo LIKE '%Ward%' OR cuerpo LIKE '%Dimitri%' OR nombre LIKE '%Ward%')
   ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else ('←' if r['direccion']=='saliente' else '·')
    print(f" {r['timestamp'][5:16]} {r['canal'][:4]} {f} {(r['c'] or '').replace(chr(10),' | ')[:135]}")
print("\n── contacto Ward ahora ──")
for c in db.execute("SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE nombre LIKE '%Ward%'"):
    print('  ',dict(c))
print("\n── wa_outbox desde el viernes ──")
for r in db.execute("SELECT id,numero,estado,intentos,creado,substr(texto,1,60) t FROM wa_outbox WHERE creado >= '2026-08-28 21:00' ORDER BY id"):
    print('  ',dict(r))
print("\n════ eventos de sistema notables ════")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,130) c FROM eventos
   WHERE canal='sistema' AND timestamp >= '2026-08-28 21:00'
     AND cuerpo NOT LIKE 'claude_call%' AND cuerpo NOT LIKE 'acción ejecutada%'
     AND cuerpo NOT LIKE '%meeting-prep%' ORDER BY timestamp DESC LIMIT 15"""):
    print(f" {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo ""
echo "════ latidos / barrido ════"
timeout 10 grep -c "RECUPERO" /root/.pm2/logs/maria-paez-out.log
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler'), wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  teléfono:', min(wh.ultimoLatido()), '| gmail:', min(gh.ultimoLatidoGmail()));"
echo LISTO
