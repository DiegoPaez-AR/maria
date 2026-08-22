#!/bin/bash
cd /root/secretaria
echo "── HEAD / canary ──"; git log --oneline -1; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MARKER MALO" || echo "sin marker (OK)"
echo "── pm2 ──"; timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if 'maria' not in p['name']: continue
    e=p['pm2_env']; print(p['name'], e['status'], 'restarts=%s'%e['restart_time'], 'up=%dmin'%((time.time()*1000-e['pm_uptime'])/60000))"
echo "── wwebjs realmente fuera? ──"
timeout 10 pgrep -c chromium >/dev/null && echo "⚠️ chromium vivo" || echo "sin chromium ✓"
ls node_modules/whatsapp-web.js >/dev/null 2>&1 && echo "(node_modules aún tiene wwebjs — pendiente npm prune)" || echo "node_modules limpio"
echo "── SALIENTES desde 16:50 (buscando duplicados de la Maria fantasma) ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ.get('MARIA_DB'))
db.row_factory=sqlite3.Row
q="""SELECT timestamp,canal,COALESCE(nombre,de) dest,substr(cuerpo,1,70) c
     FROM eventos WHERE direccion='saliente' AND timestamp >= datetime('now','-70 minutes')
     ORDER BY timestamp"""
rs=db.execute(q).fetchall()
print(f"{len(rs)} salientes en los últimos 70 min")
for r in rs: print(' ', r['timestamp'], r['canal'], '→', r['dest'], '|', (r['c'] or '').replace('\n',' '))
print('── duplicados exactos (mismo destino + mismo texto) ──')
for r in db.execute("""SELECT COUNT(*) n, COALESCE(nombre,de) d, substr(cuerpo,1,60) c
     FROM eventos WHERE direccion='saliente' AND timestamp >= datetime('now','-70 minutes')
     GROUP BY d, c HAVING n>1"""):
    print('  ⚠️', r[0], 'veces →', r[1], '|', (r[2] or '').replace('\n',' '))
print('── outbox WA reciente ──')
for r in db.execute("SELECT id,numero,estado,intentos,substr(texto,1,45) t FROM wa_outbox ORDER BY id DESC LIMIT 8"):
    print('  #%s'%r[0], r[1], r[2], 'int=%s'%r[3], (r[4] or '').replace('\n',' '))
db.close()
PY
echo "── qué hizo reenviar-gabi-wa ──"; head -30 ops/instances/maria-paez/outbox/reenviar-gabi-wa.out 2>/dev/null | tail -18
echo "── errores del runtime ──"; timeout 10 tail -40 /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -12
echo LISTO
