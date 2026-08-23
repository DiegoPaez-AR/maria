#!/bin/bash
cd /root/secretaria
cat state/.canary-bad-commit 2>/dev/null && echo "CANARY MALO" || echo "canary limpio"
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p[chr(39)+chr(39)] if False else p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
grep -q ultimoLatidoGmail gmail-handler.js && echo "  latido gmail OK" || echo "  latido gmail FALTA"
grep -q _ruidoTG telegram-handler.js && echo "  agrupador TG OK" || echo "  agrupador TG FALTA"
grep -q buscarContactosVisibles executor.js && echo "  resolver nombre OK" || echo "  resolver nombre FALTA"
echo LISTO
