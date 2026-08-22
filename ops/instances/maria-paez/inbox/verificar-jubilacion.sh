#!/bin/bash
cd /root/secretaria
echo "── canary / commit vivo ──"; git log --oneline -1; ls state/.canary-bad-commit 2>/dev/null && echo "⚠️ CANARY MALO" || echo "canary sin marker (OK)"
echo "── pm2 ──"; pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{JSON.parse(d).filter(p=>p.name.includes('maria')).forEach(p=>console.log(p.name,p.pm2_env.status,'restarts='+p.pm2_env.restart_time,'uptime='+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)+'s'))}catch(e){console.log('?')}})"
echo "── npm test ──"; env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL npm test 2>&1 | tail -12
echo "── require-smoke de los tocados ──"
node -e "for (const m of ['./index','./internal-api','./telegram-handler','./unknown-flow','./wa-validate','./session-manager','./loop-guard','./gmail-handler']) { try { require(m); console.log('ok', m) } catch(e) { console.log('FALLA', m, e.message) } }" 2>&1 | tail -12
echo "── chromium/puppeteer vivo? ──"; pgrep -fa chromium | head -3 || echo "sin chromium ✓"
echo "── /send-wa (antes 503) ──"
_port=$(grep -oP 'ASISTENTE_INTERNAL_PORT=\K.*' config/maria-paez.conf 2>/dev/null | tr -d '"')
_sec=$(grep -oP 'ASISTENTE_INTERNAL_SECRET=\K.*' config/secrets.conf 2>/dev/null | tr -d '"')
[ -n "$_port" ] && curl -s -m 10 -o /dev/null -w 'HTTP=%{http_code}\n' -X POST "http://127.0.0.1:$_port/health" -H "x-intensa-secret: $_sec"
echo "── logs recientes ──"; tail -25 /root/.pm2/logs/maria-paez-out.log | grep -v "\[MB" | tail -15
echo "── errores ──"; tail -30 /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -10
echo LISTO
