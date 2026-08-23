#!/bin/bash
cd /root/secretaria
echo "════ EJECUCIÓN REAL de la revisión de dormidos (pedido de Diego) ════"
timeout 200 node -e "
const d=require('/root/secretaria/usuarios-dormidos');
d.revisar({dryRun:false}).then(r=>{
  console.log('  pausados:', r.pausados.length);
  for (const x of r.pausados) console.log('   · '+x.nombre.padEnd(22)+x.dias+' días   mail→ '+(x.email||'(sin email)'));
}).catch(e=>console.log('  ERR:', e.message));"
echo ""
echo "── estado después ──"
timeout 20 node -e "
const u=require('/root/secretaria/usuarios');
console.log('  siguen con brief:', u.listarServidos().map(x=>x.nombre).join(', '));
console.log('  pausados        :', u.listarPausados().map(x=>x.nombre).join(', ')||'(ninguno)');"
echo "── mails que salieron ──"
timeout 15 grep -E "2026-08-23.*(pausa|dormidos|enviarEmail|GMAIL →)" /root/.pm2/logs/maria-paez-out.log | tail -12
echo LISTO
