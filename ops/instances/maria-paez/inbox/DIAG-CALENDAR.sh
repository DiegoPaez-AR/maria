#!/bin/bash
echo "== errores calendar/google en logs (hoy) =="
grep -aiE "calendar|agenda" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -a "$(date +%Y-%m-%d)" | tail -8
grep -aiE "calendar" /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -a "$(date +%Y-%m-%d)" | tail -6
echo "== test directo listarEventosProximos =="
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node -e "
const g = require('/root/secretaria/google');
g.listarEventosProximos({ max: 3 }).then(evs => console.log('CALENDAR OK,', evs.length, 'eventos')).catch(e => console.log('CALENDAR FALLO:', e.message));
" 2>&1 | tail -2
echo "== consultas MCP en turnos wa-hook (contexto del error) =="
grep -a "wahook" /root/.pm2/logs/maria-paez-*.log 2>/dev/null | tail -6
