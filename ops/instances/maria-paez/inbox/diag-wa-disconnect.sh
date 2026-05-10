#!/bin/bash
set +e

echo "── 1. pm2 jlist info ──"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] != 'maria-paez': continue
    e = p['pm2_env']
    print(f\"pid:                  {p.get('pid')}\")
    print(f\"restart_time:         {e.get('restart_time')}\")
    print(f\"unstable_restarts:    {e.get('unstable_restarts')}\")
    print(f\"pm_uptime (ts):       {e.get('pm_uptime')}\")
    print(f\"created_at (ts):      {e.get('created_at')}\")
    print(f\"exit_code:            {e.get('exit_code')}\")
    print(f\"status:               {e.get('status')}\")
    print(f\"max_memory_restart:   {e.get('max_memory_restart')}\")
    mem = p.get('monit', {}).get('memory', 0)
    print(f\"memory current (MB):  {mem / 1024 / 1024:.1f}\")
    print(f\"cpu:                  {p.get('monit', {}).get('cpu')}%\")
"
echo
echo "── 2. Cuándo arrancó el proceso actual ──"
date -d @$(($(pm2 jlist 2>/dev/null | python3 -c "import json,sys; print([p for p in json.load(sys.stdin) if p['name']=='maria-paez'][0]['pm2_env']['pm_uptime'])") / 1000))
echo

echo "── 3. Últimas 100 líneas del log de salida (sin filtros) ──"
tail -100 /root/.pm2/logs/maria-paez-out.log
echo
echo "── 4. Log de error de pm2 ──"
tail -50 /root/.pm2/logs/maria-paez-error.log 2>&1
echo
echo "── 5. Buscar disconnected/change_state/crash en TODO el log de hoy ──"
grep -E '2026-05-10' /root/.pm2/logs/maria-paez-out.log 2>&1 | grep -E 'change_state|disconnected|SIGINT|iniciando|crash|frame muerto|WA ready|authenticated' | head -50
echo
echo "── 6. Estructura interna de .wwebjs_auth ──"
ls -la /root/secretaria/state/maria-paez/.wwebjs_auth/
ls /root/secretaria/state/maria-paez/.wwebjs_auth/session/ 2>&1 | head -10
echo "  total entries en session/:"
ls /root/secretaria/state/maria-paez/.wwebjs_auth/session/ 2>&1 | wc -l
echo
echo "── 7. Versión de whatsapp-web.js instalada ──"
cd /root/secretaria
node -e "console.log(require('whatsapp-web.js/package.json').version)" 2>&1
echo
echo "── 8. Disco / memoria del VPS ──"
df -h / 2>&1 | head -3
free -h 2>&1 | head -3
