#!/bin/bash
set +e
cd /root/secretaria
echo "### Discovery: donde vive STRIPE_PRICE_ID / SECRET ###"
for f in config/secrets.conf .env-intensa-api .env; do
  echo "--- $f ---"
  [ -f "$f" ] && grep -nE "STRIPE_PRICE_ID|STRIPE_SECRET_KEY|STRIPE_.*MODE|STRIPE_PRODUCT" "$f" | sed -E 's/(SECRET_KEY[^=]*=).*/\1***masked***/'
done
echo
echo "### Crear/asegurar Price 39.99 via API ###"
node <<'NODE'
const fs=require('fs');
function load(f){ if(!fs.existsSync(f))return {}; const o={}; for(let l of fs.readFileSync(f,'utf8').split('\n')){l=l.trim(); if(!l||l.startsWith('#'))continue; const i=l.indexOf('='); if(i<0)continue; let k=l.slice(0,i).trim(),v=l.slice(i+1).trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1); o[k]=v;} return o;}
const env = Object.assign({}, load('.env'), load('.env-intensa-api'), load('config/secrets.conf'));
process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
const curPrice = env.STRIPE_PRICE_ID;
const stripe = require('./ops/backend/intensa-api/lib/stripe.js');
(async()=>{
  const k=env.STRIPE_SECRET_KEY||'';
  console.log('KEY_MODE='+(k.startsWith('sk_live')?'LIVE':(k.startsWith('sk_test')?'TEST':'??')));
  console.log('CUR_PRICE_ID='+curPrice);
  const p = await stripe.api('GET','/prices/'+curPrice);
  console.log('PRODUCT='+p.product+' CUR_AMOUNT='+p.unit_amount+' CUR_CURRENCY='+p.currency+' INTERVAL='+(p.recurring&&p.recurring.interval));
  const LK='maria_monthly_3999';
  const ex = await stripe.api('GET','/prices?lookup_keys[]='+LK+'&active=true&limit=1');
  let np;
  if(ex.data && ex.data.length){ np=ex.data[0]; console.log('REUSED_EXISTING=1'); }
  else { np = await stripe.api('POST','/prices',{ product:p.product, unit_amount:3999, currency:p.currency||'usd', recurring:{interval:'month'}, lookup_key:LK, nickname:'Maria Monthly 39.99' }); console.log('CREATED=1'); }
  console.log('NEW_PRICE_ID='+np.id+' AMOUNT='+np.unit_amount+' CURRENCY='+np.currency+' ACTIVE='+np.active+' INTERVAL='+(np.recurring&&np.recurring.interval));
})().catch(e=>{ console.error('ERR '+e.message+' '+JSON.stringify(e.stripe||{})); process.exit(1); });
NODE
echo "=== DONE ==="
