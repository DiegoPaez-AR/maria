#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
node -e "
const ms=require('/root/secretaria/media-store');
console.log('MEDIA_DIR:', ms.MEDIA_DIR);
// smoke: guardar + publicar + resolver + podar(0 esperado)
const id=ms.guardar(Buffer.from('hola maria'),'test.txt');
const url=ms.publicar(id);
const fs=require('fs');
console.log('guardar/publicar OK:', id, '→', url.replace(/m-[a-f0-9]+/,'m-<token>'));
const curl=require('child_process').execSync('curl -s '+url).toString();
console.log('descarga pública:', curl==='hola maria' ? 'OK ✓' : 'FALLO: '+curl.slice(0,40));
// limpiar el test
fs.unlinkSync(ms.resolver(id)); fs.unlinkSync('/var/www/intensa.io/_dl/'+url.split('/').pop());
console.log('test limpiado');
"
echo LISTO
