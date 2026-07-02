#!/bin/bash
set +e
cd /root/secretaria
NEW=price_1TotEABSnDFb8JXIoeAVf15l
echo "### 0) esperar a que el codigo nuevo (trial) este en disco ###"
for i in $(seq 1 30); do
  grep -q "trial_period_days" ops/backend/intensa-api/routes/signup.js && { echo "codigo trial presente (intento $i)"; break; }
  sleep 2
done
grep -q "trial_period_days" ops/backend/intensa-api/routes/signup.js || { echo "FATAL: signup.js sin trial_period_days, aborto"; echo "=== DONE ==="; exit 1; }

echo "### 1) que STRIPE_ keys hay en cada archivo (masked) ###"
for f in .env-intensa-api config/secrets.conf; do
  echo "--- $f ---"; grep -nE "^STRIPE_" "$f" 2>/dev/null | sed -E 's/=.*/=***/'
done

echo "### 2) backup + update STRIPE_PRICE_ID en .env-intensa-api ###"
cp -a .env-intensa-api .env-intensa-api.bak.$(date +%s)
echo "antes:"; grep -n "STRIPE_PRICE_ID" .env-intensa-api | sed -E 's/=price_.*/=price_...(old)/'
sed -i -E "s#^STRIPE_PRICE_ID=.*#STRIPE_PRICE_ID=${NEW}#" .env-intensa-api
echo "despues:"; grep -n "STRIPE_PRICE_ID=" .env-intensa-api

echo "### 3) restart intensa-api (delete + start ecosystem, con secrets del cron env) ###"
pm2 delete intensa-api >/dev/null 2>&1
pm2 start ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -6
sleep 3
echo "--- pm2 status intensa-api ---"; pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print(p['name'],p['pm2_env']['status'],'restarts='+str(p['pm2_env'].get('restart_time'))) for p in json.load(sys.stdin) if p['name']=='intensa-api']"
PORT=$(grep -E '^INTENSA_API_PORT=' .env-intensa-api | cut -d= -f2- | tr -d '"'); PORT=${PORT:-4080}
echo "--- health :$PORT/health ---"; curl -s -m 5 -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1:$PORT/health"

echo "### 4) confirmar price nuevo activo + trial en codigo ###"
node -e '
const fs=require("fs");
function load(f){const o={};if(!fs.existsSync(f))return o;for(let l of fs.readFileSync(f,"utf8").split("\n")){l=l.trim();if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<0)continue;let k=l.slice(0,i).trim(),v=l.slice(i+1).trim();if((v[0]=="\"'"'"'".includes(v[0]))&&v[0]==v.slice(-1))v=v.slice(1,-1);o[k]=v;}return o;}
const env=Object.assign({},load(".env-intensa-api"),load("config/secrets.conf"));
process.env.STRIPE_SECRET_KEY=env.STRIPE_SECRET_KEY;
const s=require("./ops/backend/intensa-api/lib/stripe.js");
s.api("GET","/prices/"+load(".env-intensa-api").STRIPE_PRICE_ID).then(p=>console.log("PRICE",p.id,p.unit_amount,p.currency,"active="+p.active)).catch(e=>console.log("ERR",e.message));
' 2>&1
grep -n "trial_period_days" ops/backend/intensa-api/routes/signup.js

echo "### 5) deploy web (deploy.sh) ###"
bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -25

echo "### 6) smoke web: precio y trial servidos ###"
echo "-- landing --"; curl -s -m 5 -H "Host: intensa.io" https://127.0.0.1/maria/ -k | grep -oE '\$39\.99|Primeros 7 d[^<]*gratis' | head
echo "-- signup --"; curl -s -m 5 -H "Host: intensa.io" https://127.0.0.1/maria/signup/ -k | grep -oE '39\.99|7 d[^<.]*gratis' | head
echo "-- quedan 49.99 servidos? --"; curl -s -m 5 -H "Host: intensa.io" https://127.0.0.1/maria/ -k | grep -c "49.99"
echo "=== DONE ==="
