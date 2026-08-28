#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo "── el slim corre en el proceso vivo ──"
timeout 90 node -e "
(async()=>{
  const usuarios=require('/root/secretaria/usuarios');
  const pb=require('/root/secretaria/prompt-builder');
  const u=usuarios.obtenerOwner();
  const entrada={de:'5491134897992@c.us', nombre:'Fico restaurante', cuerpo:'prueba',
    contextoRemitente:{esTercero:true, via:'libreta', razon:'x'}};
  const p=await pb.construirPrompt({usuario:u, canal:'whatsapp', entrada});
  console.log('  system+user =', p.system.length+p.user.length, 'chars (con slim activo)');
})().catch(e=>console.log('ERR',e.message));" 2>&1 | grep -vE "Warning"
echo "── sesiones ──"; grep -E '^MARIA_SESION' config/instances/*.conf
echo LISTO
