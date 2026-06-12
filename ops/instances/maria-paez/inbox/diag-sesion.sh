#!/bin/bash
set -u
python3 -c "
import sqlite3
db = sqlite3.connect('/root/secretaria/state/maria-paez/db/maria.sqlite')
db.row_factory = sqlite3.Row
print('== estado_usuario claves sesion ==')
for r in db.execute(\"SELECT usuario_id, clave, substr(valor_json,1,120) v, actualizado FROM estado_usuario WHERE clave LIKE '%sesion%'\"):
    print(dict(r))
print('== ultimos claude_call con metadata sesion ==')
for r in db.execute(\"SELECT id, timestamp, substr(metadata_json,1,260) m FROM eventos WHERE metadata_json LIKE '%claude_call%' AND canal='sistema' ORDER BY id DESC LIMIT 4\"):
    print(dict(r))
"
echo "== env del proceso =="
pm2 jlist | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    if p.get('name')=='maria-paez':
        e=p.get('pm2_env',{}).get('env',{})
        print('MARIA_SESIONES:', e.get('MARIA_SESIONES','(NO SETEADA)'))
"
