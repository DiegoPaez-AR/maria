#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/reload-verify-3fixes.out"
{
echo "=== fixes presentes en el codigo desplegado? ==="
echo -n "fix1 heredar wa_cus: "; grep -c "wa_cus heredado de libreta" /root/secretaria/executor.js
echo -n "fix1 flag sin_whatsapp: "; grep -c "sin_whatsapp: _sinWa" /root/secretaria/executor.js
echo -n "fix2 vcard no silencioso: "; grep -c "vcard_no_resuelto" /root/secretaria/whatsapp-handler.js
echo -n "fix3 calendar read: "; grep -c "ya puedo agendar desde mi lado" /root/secretaria/prompt-builder.js
echo "=== node --check ==="
node --check /root/secretaria/executor.js && node --check /root/secretaria/whatsapp-handler.js && node --check /root/secretaria/prompt-builder.js && echo "SYNTAX OK"
echo "=== reload ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env; echo "exit=$?"
sleep 7
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})'
pm2 logs maria-paez --nostream --lines 4 2>/dev/null | tail -4
} > "$OUT" 2>&1
echo done >> "$OUT"
