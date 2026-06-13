#!/bin/bash
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
TDIR=/root/secretaria/state/maria-paez
echo "== estado actual de los tokens =="
ls -la "$TDIR"/token.json "$TDIR"/token.json.enc 2>&1
echo ""
# Validar que el token.json plano sea fresco (modificado en la última hora)
if [ ! -f "$TDIR/token.json" ]; then
  echo "ABORT: no existe token.json plano — el reauth no escribió nada. Hay que rehacer el flow."
  exit 1
fi
AGE=$(( $(date +%s) - $(stat -c %Y "$TDIR/token.json") ))
echo "token.json plano: ${AGE}s de antigüedad"
if [ "$AGE" -gt 7200 ]; then
  echo "ABORT: token.json tiene más de 2h — no parece el del reauth de recién. No toco nada."
  exit 1
fi
STAMP=$(date +%Y-%m-%dT%H%M%S)
if [ -f "$TDIR/token.json.enc" ]; then
  mv "$TDIR/token.json.enc" "$TDIR/token.json.enc.revoked.$STAMP"
  echo "movido .enc revocado → token.json.enc.revoked.$STAMP"
fi
echo ""
echo "== reload para que google.js auto-migre el plano → .enc =="
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -5
sleep 12
echo ""
echo "== ¿se regeneró el .enc? =="
ls -la "$TDIR"/token.json.enc 2>&1
echo ""
echo "== healthcheck post-fix =="
bash /root/secretaria/ops/healthcheck.sh 2>&1 | grep -A1 google_oauth
