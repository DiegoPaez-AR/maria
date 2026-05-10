#!/bin/bash
set +e
echo "=== pm2 status maria-paez ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
ps=json.load(sys.stdin)
for p in ps:
    if p.get('name')!='maria-paez': continue
    e=p.get('pm2_env',{})
    print('status', e.get('status'), 'restarts', e.get('restart_time'), 'uptime_ms', e.get('pm_uptime'))"
echo
echo "=== logs últimas 60 ==="
pm2 logs maria-paez --lines 80 --nostream --raw 2>&1 | tail -60
echo
echo "=== sqlite: estructura de contactos ==="
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
python3 << 'PY'
import sqlite3
db = sqlite3.connect('/root/secretaria/state/maria-paez/db/maria.sqlite')
print('TABLE INFO:')
for r in db.execute("PRAGMA table_info(contactos)").fetchall(): print(' ', r)
print('INDEXES:')
for r in db.execute("PRAGMA index_list(contactos)").fetchall(): print(' ', r)
print('COUNT por visibilidad:')
for r in db.execute("SELECT visibilidad, COUNT(*) FROM contactos GROUP BY visibilidad").fetchall(): print(' ', r)
print('TOTAL:', db.execute("SELECT COUNT(*) FROM contactos").fetchone()[0])
print('SAMPLE 5:')
for r in db.execute("SELECT id, usuario_id, nombre, visibilidad, cumple FROM contactos ORDER BY id LIMIT 5").fetchall(): print(' ', r)
print('CON CUMPLE:')
for r in db.execute("SELECT id, nombre, cumple, visibilidad FROM contactos WHERE cumple IS NOT NULL").fetchall(): print(' ', r)
PY
echo
echo "=== smoke test funciones nuevas via node ==="
cd /root/secretaria
node -e "
const m = require('./memory');
console.log('contactosPublicos:', typeof m.contactosPublicos, '=', m.contactosPublicos().length);
console.log('contactosPrivados:', typeof m.contactosPrivados, '=', m.contactosPrivados(1).length);
console.log('cumpleañerosDelDia:', typeof m.cumpleañerosDelDia);
console.log('cambiarVisibilidadContacto:', typeof m.cambiarVisibilidadContacto);
console.log('setCumpleContacto:', typeof m.setCumpleContacto);
console.log('upsertContacto firma OK?:', m.upsertContacto.toString().includes('visibilidad'));
" 2>&1 | tail -20
