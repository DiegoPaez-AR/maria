#!/bin/bash
set -u
echo "===== 1) reload intensa-api (toma webhook.js nuevo) ====="
cd /root/secretaria
pm2 reload ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -2
sleep 2
pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api':
    print('  intensa-api status=',p.get('pm2_env',{}).get('status'))"
echo
echo "===== 2) deploy del sitio intensa.io (publica a /var/www) ====="
bash /root/secretaria/ops/sites/intensa.io/deploy.sh 2>&1 | tail -40
echo
echo "===== 3) checks del signup publicado ====="
echo -n "copy nuevo (sin 'prueba gratuita')? "
if curl -s -H "Host: intensa.io" https://127.0.0.1/maria/signup/ -k | grep -q "prueba gratuita de 7"; then echo "TODAVÍA viejo (mal)"; else echo "OK actualizado"; fi
echo -n "step-listo presente en el HTML? "
curl -s -H "Host: intensa.io" https://127.0.0.1/maria/signup/ -k | grep -q 'id="step-listo"' && echo "OK" || echo "NO (mal)"
echo -n "listo.sub en script.js publicado? "
curl -s -H "Host: intensa.io" "https://127.0.0.1/maria/signup/script.js" -k | grep -q "listo.sub" && echo "OK" || echo "NO (revisar cache-bust)"
