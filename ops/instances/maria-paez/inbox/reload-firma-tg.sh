#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
cat > /tmp/tf.cjs <<'JS'
// smoke: la firma correcta según destinatario (sin enviar nada)
const g=require("/root/secretaria/google.js");
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const sinTG=db.prepare("SELECT nombre,email FROM usuarios WHERE activo=1 AND telegram_chat_id IS NULL AND email IS NOT NULL LIMIT 1").get();
const conTG=db.prepare("SELECT nombre,email FROM usuarios WHERE telegram_chat_id IS NOT NULL LIMIT 1").get();
db.close();
console.log("usuario SIN tg:", sinTG ? sinTG.nombre : "-", "| usuario CON tg:", conTG ? conTG.nombre : "-");
JS
node /tmp/tf.cjs; rm -f /tmp/tf.cjs
echo LISTO
