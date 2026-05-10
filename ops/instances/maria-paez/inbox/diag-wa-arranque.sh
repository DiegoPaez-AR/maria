#!/bin/bash
set +e
echo "=== uptime VPS ==="
uptime
last reboot 2>/dev/null | head -3
echo
echo "=== pm2 info maria-paez ==="
pm2 info maria-paez 2>/dev/null | grep -E 'name|status|restart|uptime|created|script|cwd|exec mode|node|version|exit code|error log|out log' | head -25
echo
echo "=== WA_AUTH_DIR estructura ==="
WA=/root/secretaria/state/maria-paez/.wwebjs_auth
if [ -d "$WA" ]; then
  echo "exists: $WA"
  du -sh "$WA"
  find "$WA" -maxdepth 3 -printf '%TY-%Tm-%Td %TH:%TM  %s  %p\n' 2>/dev/null | head -40
  echo "--- LOCK files? ---"
  find "$WA" -name '*lock*' -o -name '*Lock*' 2>/dev/null | head -10
  echo "--- size del session principal ---"
  ls -la "$WA"/session 2>/dev/null | head -20
  ls -la "$WA"/session/Default 2>/dev/null | head -20
else
  echo "NO EXISTE $WA"
fi
echo
echo "=== logs pm2 maria-paez últimas 1500 líneas, busco eventos clave ==="
pm2 logs maria-paez --lines 1500 --nostream --raw 2>&1 | grep -nE 'iniciando|whisper|qr|loading|authenticated|ready|disconnected|auth_failure|SIGINT|frame muerto|Error|Cannot|TypeError|exit|crash' | tail -120
echo
echo "=== restart reasons (jlist) ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
ps=json.load(sys.stdin)
for p in ps:
    if p.get('name')!='maria-paez': continue
    e=p.get('pm2_env',{})
    print('status', e.get('status'))
    print('restart_time', e.get('restart_time'))
    print('unstable_restarts', e.get('unstable_restarts'))
    print('exit_code', e.get('exit_code'))
    print('created_at', e.get('created_at'))
    print('pm_uptime', e.get('pm_uptime'))
    print('axm_actions', list((e.get('axm_actions') or {}).keys())[:5])
"
echo
echo "=== version de whatsapp-web.js instalada ==="
cat /root/secretaria/node_modules/whatsapp-web.js/package.json 2>/dev/null | python3 -c "import json,sys; p=json.load(sys.stdin); print(p.get('name'),p.get('version'))"
echo
echo "=== chrome version ==="
google-chrome --version 2>&1 | head -1
