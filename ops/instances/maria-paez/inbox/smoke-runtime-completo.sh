#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c '
import sys,json,datetime
d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]
r=d[0] if d else None
if r:
    arr=datetime.datetime.fromtimestamp(r["pm2_env"]["pm_uptime"]/1000)
    print("pid:",r["pid"],"restart:",r["pm2_env"]["restart_time"],"arrancó:",arr.isoformat())
'

echo ""
echo "═══ Smoke runtime: cargar modulos + construir prompt ═══"
cd /root/secretaria && node -e "
(async () => {
  const usuarios = require('./usuarios');
  const pb = require('./prompt-builder');
  const owner = usuarios.obtenerOwner();
  console.log('owner:', owner.nombre, 'id=' + owner.id);
  const prompt = await pb.construirPrompt({
    usuario: owner,
    canal: 'whatsapp',
    entrada: { de: owner.wa_cus || owner.wa_lid, nombre: owner.nombre, cuerpo: 'test smoke' }
  });
  console.log('OK prompt:', prompt.length, 'chars');
})().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
" 2>&1

echo ""
echo "═══ Errores recientes ═══"
pm2 logs maria-paez --lines 80 --nostream 2>&1 | grep -iE "ReferenceError|unhandledRejection|SyntaxError|fatal" | tail -10
