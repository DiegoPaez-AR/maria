#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo ""
echo "════ 1. ERRORES desde las 12:00 local (15:00 UTC) ════"
timeout 20 awk '$0 >= "2026-08-23 15:00" && $0 <= "2026-08-23 23:59"' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -v "fetch failed" | tail -20
echo "  fetch-failed en el período: $(timeout 10 awk '$0 >= \"2026-08-23 15:00\"' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -c 'fetch failed')"
echo ""
echo "════ 2. WARNINGS / FALLOS del out.log ════"
timeout 25 awk '$0 >= "2026-08-23 15:00"' /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "warn|fall|error|FALLO|no pude|abort|descart|huerfan|timeout" | grep -v "politica_v4" | tail -25
echo ""
echo "════ 3. CONVERSACIONES desde las 12:00 ════"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT e.timestamp,e.canal,e.direccion,COALESCE(u.nombre,e.nombre,e.de) q,substr(e.cuerpo,1,110) c
   FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp >= '2026-08-23 15:00' AND e.canal IN ('whatsapp','telegram','gmail')
   ORDER BY e.timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][11:16]} {r['canal'][:3]} {f} {(r['q'] or '?')[:18]:<18} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n════ 4. EVENTOS DE SISTEMA (claude_calls, acciones, fallos) ════")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,130) c FROM eventos
   WHERE timestamp >= '2026-08-23 15:00' AND canal='sistema' ORDER BY timestamp"""):
    print(f" {r['timestamp'][11:16]} {(r['c'] or '').replace(chr(10),' ')}")
print("\n════ 5. OUTBOX WA desde las 12:00 ════")
for r in db.execute("SELECT id,numero,estado,intentos,creado,entregado,substr(texto,1,50) t FROM wa_outbox WHERE creado >= '2026-08-23 15:00' ORDER BY id"):
    print(' ', dict(r))
db.close()
PY
echo ""
echo "════ 6. barrido / sesiones / latidos ════"
timeout 15 grep -E "barrido|RECUPERO" /root/.pm2/logs/maria-paez-out.log | tail -3
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler');
const wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  latido gmail:', min(gh.ultimoLatidoGmail()));
console.log('  latido teléfono:', min(wh.ultimoLatido()));
const mem=require('/root/secretaria/memory');
console.log('  sesión Diego:', mem.getEstadoUsuario(1,'claude_sesion'));"
echo LISTO
