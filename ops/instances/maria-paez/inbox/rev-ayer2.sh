#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
AYER=$(date -d yesterday '+%Y-%m-%d')
echo "── errores de ayer + hoy ──"
timeout 20 grep -E "^($AYER|$(date '+%Y-%m-%d'))" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -vE "poll error" | tail -20 | cut -c1-300
echo "  cortes TG: $(timeout 10 grep -E "^$AYER" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -c 'poll error')"
echo "── avisos que le llegaron a Diego por TG (alertas del sistema) ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,220) c, json_extract(metadata_json,'$.tag') tag FROM eventos
   WHERE usuario_id=1 AND canal='telegram' AND direccion='saliente' AND timestamp >= datetime('now','-30 hours')
     AND (cuerpo LIKE '%⚠️%' OR cuerpo LIKE '%🔴%' OR cuerpo LIKE '%ALERTA%' OR cuerpo LIKE '%falló%' OR cuerpo LIKE '%no pude%')
   ORDER BY timestamp"""):
    print(f" {r['timestamp'][5:16]} [{r['tag'] or '-'}] {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── conversación de Diego ayer ──")
for r in db.execute("""SELECT timestamp,direccion,substr(cuerpo,1,140) c FROM eventos
   WHERE usuario_id=1 AND canal='telegram' AND timestamp >= datetime('now','-30 hours') ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── fallos de acciones / sistema ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,200) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-30 hours')
     AND (cuerpo LIKE '%FALL%' OR cuerpo LIKE '%falló%' OR cuerpo LIKE '%no pude%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%descart%')
   ORDER BY timestamp"""):
    print(f" {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')}")
print("\n── costo ayer ──")
for r in db.execute("""SELECT date(timestamp) d, COUNT(*) n, SUM(json_extract(metadata_json,'$.cost_usd')) usd
   FROM eventos WHERE tipo='claude_call' AND timestamp >= datetime('now','-30 hours') GROUP BY d"""):
    print(f"  {r['d']}: {r['n']} turnos US$ {(r['usd'] or 0):.2f}")
db.close()
PY
echo "── latidos/canary ──"
timeout 15 node -e "
const gh=require('/root/secretaria/gmail-handler'), wh=require('/root/secretaria/wa-hook');
const min=(t)=>t?Math.round((Date.now()-t)/60000)+' min':'nunca';
console.log('  teléfono:', min(wh.ultimoLatido()), '| gmail:', min(gh.ultimoLatidoGmail()));"
cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ CANARY MALO" || echo "  canary limpio"
echo LISTO
