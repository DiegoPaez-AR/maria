#!/bin/bash
cd /root/secretaria
echo "── dónde vive el token de Telegram hoy ──"
grep -lE '^TELEGRAM_BOT_TOKEN=' config/secrets.conf config/instances/*.conf 2>/dev/null
echo "── mover TELEGRAM_* del secrets.conf global al .conf de maria-paez ──"
TOK=$(grep -E '^TELEGRAM_BOT_TOKEN=' config/secrets.conf | cut -d= -f2-)
USR=$(grep -E '^TELEGRAM_BOT_USERNAME=' config/secrets.conf | cut -d= -f2-)
if [ -n "$TOK" ]; then
  cp config/secrets.conf config/secrets.conf.bak-$(date +%s)
  grep -q '^TELEGRAM_BOT_TOKEN=' config/instances/maria-paez.conf || echo "TELEGRAM_BOT_TOKEN=$TOK" >> config/instances/maria-paez.conf
  [ -n "$USR" ] && { grep -q '^TELEGRAM_BOT_USERNAME=' config/instances/maria-paez.conf || echo "TELEGRAM_BOT_USERNAME=$USR" >> config/instances/maria-paez.conf; }
  sed -i '/^TELEGRAM_BOT_TOKEN=/d;/^TELEGRAM_BOT_USERNAME=/d' config/secrets.conf
  echo "  movido. maria-paez.conf tiene TELEGRAM: $(grep -c '^TELEGRAM_' config/instances/maria-paez.conf) líneas; secrets.conf: $(grep -c '^TELEGRAM_' config/secrets.conf)"
else
  echo "  el token NO está en secrets.conf — está en otro lado:"; grep -n 'TELEGRAM_BOT_TOKEN' config/instances/sofia-bruscoli.conf ecosystem.config.js 2>/dev/null | cut -c1-80
fi
echo "── sofia: sin Telegram hasta que tenga bot propio ──"
sed -i '/^TELEGRAM_BOT_TOKEN=/d;/^TELEGRAM_BOT_USERNAME=/d' config/instances/sofia-bruscoli.conf
echo "TELEGRAM_BOT_TOKEN=" >> config/instances/sofia-bruscoli.conf
echo "── reload de las dos ──"
timeout 90 pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "  reload OK"
sleep 20
echo "── ¿se acabó el 409? ──"
timeout 10 tail -8 /root/.pm2/logs/sofia-bruscoli-out.log | grep -E "TG|telegram" | tail -3 || echo "  sofia: sin líneas de TG (correcto)"
timeout 10 tail -5 /root/.pm2/logs/maria-paez-error.log | grep -c 409 || true
timeout 10 grep -E "arrancando telegram|TELEGRAM" /root/.pm2/logs/sofia-bruscoli-out.log | tail -2
echo LISTO
