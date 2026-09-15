#!/bin/bash
cd /root/secretaria
set -a; . config/instances/maria-paez.conf; . config/secrets.conf 2>/dev/null; set +a
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" "select id,estado,intentos,datetime(tomado_en,'-3 hours'),datetime(entregado,'-3 hours') from wa_outbox where id=271"
echo "── polls del teléfono (nginx, últimos) ──"
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | grep -E "outbox|poll" | tail -3 | cut -c1-160
grep -hE "outbox|frio|#271" logs/maria-paez/out.log | grep "^2026-09-15 1[45]" | tail -12 | cut -c1-200
echo "── siguiente() a mano (dry: ¿qué devuelve?) ──"
timeout 30 node -e '
const ob = require("./wa-outbox");
const orig = require("./memory").db.prepare;
console.log(JSON.stringify(ob.siguiente()));
' 2>&1 | tail -3
sqlite3 "$DB" "select id,estado,intentos,datetime(tomado_en,'-3 hours') from wa_outbox where id=271"
echo LISTO
