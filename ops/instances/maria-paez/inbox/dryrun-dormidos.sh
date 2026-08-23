#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo ""
echo "════ DRY-RUN: a quién pausaría el 1º de septiembre ════"
timeout 45 node -e "
const d=require('/root/secretaria/usuarios-dormidos');
d.revisar({dryRun:true}).then(r=>{
  if (!r.pausados.length) return console.log('  (ninguno)');
  for (const x of r.pausados) console.log('  · '+x.nombre.padEnd(22)+x.dias+' días'+(x.nuncaEscribio?'  (NUNCA escribió)':'')+'   '+(x.email||'sin email'));
  console.log('\n  total: '+r.pausados.length);
}).catch(e=>console.log('  err:', e.message));"
echo ""
echo "── quiénes SIGUEN recibiendo brief ──"
timeout 20 node -e "
const u=require('/root/secretaria/usuarios');
console.log('  servidos:', u.listarServidos().map(x=>x.nombre).join(', '));
console.log('  pausados hoy:', u.listarPausados().map(x=>x.nombre).join(', ')||'(ninguno)');"
echo LISTO
