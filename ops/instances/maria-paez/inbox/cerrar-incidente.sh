#!/bin/bash
cd /root/secretaria
echo "── ¿el .out de Gabi es de HOY o viejo? ──"
head -3 ops/instances/maria-paez/outbox/reenviar-gabi-wa.out 2>/dev/null
echo "── último id del outbox (si no hay >237, no se encoló nada hoy) ──"
timeout 20 python3 -c "
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB'])
print('  max id =', db.execute('SELECT MAX(id) FROM wa_outbox').fetchone()[0])
for r in db.execute(\"SELECT id,numero,estado,created_at FROM wa_outbox WHERE created_at >= datetime('now','-3 hours')\"):
    print('  reciente:', r)
db.close()"
echo "── telegram recuperado? ──"
timeout 10 tail -60 /root/.pm2/logs/maria-paez-out.log | grep -i "telegram\|\[TG\]" | tail -5
timeout 10 tail -5 /root/.pm2/logs/maria-paez-error.log
echo "── npm prune (saca Puppeteer del disco) ──"
du -sh node_modules 2>/dev/null
timeout 240 npm prune --omit=dev >/dev/null 2>&1 && echo "prune OK" || echo "prune falló/timeout"
du -sh node_modules 2>/dev/null
ls node_modules/whatsapp-web.js >/dev/null 2>&1 && echo "⚠️ wwebjs sigue" || echo "wwebjs FUERA ✓"
ls node_modules/puppeteer >/dev/null 2>&1 && echo "⚠️ puppeteer sigue" || echo "puppeteer FUERA ✓"
echo "── smoke post-prune (sin arrancar nada) ──"
timeout 60 node -e "['./memory','./usuarios','./executor','./prompt-builder','./telegram-handler','./wa-hook','./internal-api','./session-manager','./unknown-flow'].forEach(m=>require(m)); console.log('requires OK')"
echo LISTO
