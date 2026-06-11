#!/bin/bash
set -u
C=/root/secretaria/state/control/control.sqlite
echo "== webhook_events (ultimos 5) =="
sqlite3 -line "$C" "SELECT id,event_name,procesado,substr(error,1,200) AS error,recibido_en FROM webhook_events ORDER BY id DESC LIMIT 5;" 2>/dev/null || python3 -c "
import sqlite3
db=sqlite3.connect('$C'); db.row_factory=sqlite3.Row
for r in db.execute(\"SELECT id,event_name,procesado,substr(COALESCE(error,''),1,250) e,recibido_en FROM webhook_events ORDER BY id DESC LIMIT 5\"): print(dict(r))
print('== signup_pending ==')
for r in db.execute(\"SELECT id,nombre,email,wa,signup_token IS NOT NULL tok,creado,expira_en FROM signup_pending\"): print(dict(r))
print('== clientes rodrigo ==')
for r in db.execute(\"SELECT id,nombre,email,wa,estado,instancia_slug FROM clientes WHERE nombre LIKE '%rodrigo%' COLLATE NOCASE OR email LIKE '%rodrigo%'\"): print(dict(r))
"
echo "== usuario en instancia =="
python3 -c "
import sqlite3
db=sqlite3.connect('/root/secretaria/state/maria-paez/db/maria.sqlite')
db.row_factory=sqlite3.Row
for r in db.execute(\"SELECT id,nombre,email,wa_cus,activo,bienvenida_enviada FROM usuarios WHERE nombre LIKE '%rodrigo%' COLLATE NOCASE\"): print(dict(r))
"
echo "== logs intensa-api (40 lineas) =="
pm2 logs intensa-api --lines 40 --nostream 2>/dev/null | grep -iE "error|webhook|signup|rodrigo|bienvenida" | tail -20
