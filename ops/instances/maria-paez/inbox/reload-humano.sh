#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
CONF=config/instances/maria-paez.conf
grep -q "^WA_VENTANA_DESDE=" "$CONF" || { echo "" >> "$CONF"; echo "# Comportamiento humano (22/8): ventana horaria de envíos iniciados" >> "$CONF"; echo "WA_VENTANA_DESDE=8" >> "$CONF"; echo "WA_VENTANA_HASTA=23" >> "$CONF"; }
grep -E "^WA_VENTANA" "$CONF"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
cat > /tmp/vh2.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const cols=db.prepare("PRAGMA table_info(wa_outbox)").all().map(c=>c.name);
console.log("wa_outbox.no_antes:", cols.includes("no_antes") ? "OK ✓" : "FALTA ✗");
const c2=db.prepare("PRAGMA table_info(contactos)").all().map(c=>c.name);
console.log("contactos.no_contactar:", c2.includes("no_contactar") ? "OK ✓" : "FALTA ✗");
db.close();
JS
node /tmp/vh2.cjs; rm -f /tmp/vh2.cjs
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v4.2 lanzado"; fi
echo LISTO
