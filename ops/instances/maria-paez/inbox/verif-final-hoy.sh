#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
git log --oneline -1 | cut -c1-55
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo "── el daily-report arma bien el desglose? (dry) ──"
timeout 60 node -e "
const dr=require('/root/secretaria/daily-report');
console.log('  módulo carga OK, exports:', Object.keys(dr).join(', '));" 2>&1 | tail -3
echo "── pausados / servidos ──"
timeout 20 node -e "
const u=require('/root/secretaria/usuarios');
console.log('  servidos:', u.listarServidos().length, '| pausados:', u.listarPausados().length);"
echo "── sesión de Diego (rotación a 12) ──"
timeout 15 node -e "const mem=require('/root/secretaria/memory'); console.log('  ', mem.getEstadoUsuario(1,'claude_sesion')||'(sin sesión)');"
echo "── errores nuevos ──"; timeout 10 tail -5 /root/.pm2/logs/maria-paez-error.log
echo LISTO
