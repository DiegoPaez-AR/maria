#!/bin/bash
cd /root/secretaria
echo "── el poll de Gmail está vivo? ──"
timeout 15 grep -E "\[gmail|GMAIL" /root/.pm2/logs/maria-paez-out.log | tail -6
echo "── últimos entrantes de gmail (cualquier fecha) ──"
timeout 20 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,de,substr(cuerpo,1,60) c FROM eventos
   WHERE canal='gmail' AND direccion='entrante' ORDER BY timestamp DESC LIMIT 5"""):
    print(' ',r['timestamp'],'|',(r['de'] or '')[:40],'|',(r['c'] or '').replace(chr(10),' '))
print(" pendientes abiertos por dueno:")
for r in db.execute("SELECT dueno, estado, COUNT(*) n FROM pendientes GROUP BY dueno, estado"):
    print('  ',dict(r))
db.close()
PY
echo "── barrido v4.5 + sesión de Diego ──"
timeout 15 grep -E "barrido|RECUPERO" /root/.pm2/logs/maria-paez-out.log | tail -4
timeout 15 node -e "const mem=require('/root/secretaria/memory'); console.log('  sesión:', mem.getEstadoUsuario(1,'claude_sesion')||'(sin sesión)');"
echo LISTO
