#!/bin/bash
cd /root/secretaria
echo "── turnos de sesión en el log (nueva / resume / rotación) ──"
timeout 15 grep -E "sesion|\[TG sesion" /root/.pm2/logs/maria-paez-out.log | tail -25
echo ""
echo "── estado de la sesión guardada ──"
timeout 20 node -e "
const mem=require('/root/secretaria/memory'), us=require('/root/secretaria/usuarios');
const u=us.listarActivos().find(x=>x.nombre==='Diego');
const raw=mem.getEstadoUsuario(u.id,'claude_sesion');
console.log(' Diego id='+u.id, '→', raw||'(sin sesión)');
"
echo ""
echo "── últimos turnos por Telegram (in/out) ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,direccion,substr(cuerpo,1,150) c FROM eventos
   WHERE canal='telegram' AND timestamp >= datetime('now','-3 hours') ORDER BY timestamp"""):
    f = '→' if r['direccion']=='entrante' else '←'
    print(' ',r['timestamp'],f,(r['c'] or '').replace('\n',' | '))
db.close()
PY
echo ""
echo "── costo/tokens de los últimos turnos ──"
timeout 25 python3 - <<'PY'
import sqlite3,os,json
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
try:
    rs=db.execute("""SELECT timestamp, metadata FROM eventos
       WHERE timestamp >= datetime('now','-3 hours') AND metadata LIKE '%tokens%'
       ORDER BY timestamp DESC LIMIT 12""").fetchall()
    for r in rs:
        try:
            m=json.loads(r['metadata'])
        except Exception: continue
        k={x:m[x] for x in m if 'token' in x.lower() or x in ('sesion','canal_origen','costo')}
        if k: print(' ',r['timestamp'],k)
except Exception as e: print(' (sin telemetría de tokens:',e,')')
db.close()
PY
echo "── acciones fallidas recientes ──"
timeout 15 grep -iE "acción FALLÓ|accion fallo|turn-results|FALLO" /root/.pm2/logs/maria-paez-out.log | tail -8
echo LISTO
