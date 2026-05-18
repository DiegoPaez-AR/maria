#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ Módulos Fase 2 cargan + acciones cableadas ═══"
cd /root/secretaria && node -e "
const ms = require('./providers/microsoft');
const providers = require('./providers');
const detect = require('./providers/detect');
console.log('providers/microsoft exports:', Object.keys(ms).length);
console.log('  has helpers:', !!ms.nuevoPkcePair && !!ms.buildAuthUrl && !!ms.intercambiarCodePorTokens);

// detect outlook → microsoft
const d = detect.detectarProvider('user@outlook.com');
console.log('detect(user@outlook.com):', JSON.stringify(d));

// providers.forUser con calendar_provider=microsoft NO debería throw 'not implemented'
const fakeUser = { id: 999, nombre: 'test', calendar_provider: 'microsoft', calendar_auth_json: null };
try {
  // forUser llama getContext que llama _getAccessToken que llama _credenciales que tira porque no hay calendar_auth_json
  providers.forUser(fakeUser).catch(err => console.log('expected error (no creds):', err.message.slice(0,80)));
} catch (e) { console.log('unexpected throw:', e.message); }
" 2>&1

echo ""
echo "═══ Acciones nuevas en executor ═══"
grep -c "iniciar_microsoft_auth\|configurar_microsoft\|_iniciarMicrosoftAuth\|_configurarMicrosoft" /root/secretaria/executor.js

echo ""
echo "═══ Prompt-builder con flow 2c real ═══"
grep -c "iniciar_microsoft_auth\|configurar_microsoft" /root/secretaria/prompt-builder.js

echo ""
echo "═══ Healthcheck final ═══"
bash /root/secretaria/ops/healthcheck.sh | python3 -c 'import sys,json; d=json.load(sys.stdin); print("overall_ok:", d["overall_ok"]); print(json.dumps({k:v["ok"] for k,v in d["checks"].items()}))'
