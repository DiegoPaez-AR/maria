#!/bin/bash
cd /root/secretaria; sleep 50
grep -E "^# (pass|fail)" /tmp/canary-tick.log | tr '\n' ' '; echo
git log --oneline -1 -- wa-hook.js | cat
pm2 jlist | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'up',int((time.time()*1000-p['pm2_env']['pm_uptime'])//60000),'min') for p in json.load(sys.stdin) if p['name'] in ('maria-paez','sofia-bruscoli')]"
echo "── simulación del match (sin turno): ¿'Telecentro' resuelve a la ficha? ──"
set -a; . config/instances/maria-paez.conf; . config/secrets.conf 2>/dev/null; set +a
timeout 20 node -e '
const mem=require("./memory"); const n="telecentro";
const rows=mem.db.prepare("SELECT id,nombre,whatsapp FROM contactos WHERE lower(trim(nombre)) LIKE ? || \x27%\x27").all(n).filter(r=>{const c=r.nombre.trim().toLowerCase(); return c===n || (c.startsWith(n) && /[\s\-–—(|,:]/.test(c.charAt(n.length)));});
console.log(" ", JSON.stringify(rows));'
echo LISTO
