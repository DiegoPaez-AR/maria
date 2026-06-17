#!/bin/bash
set +e
echo "== stop maria-paez =="
pm2 stop maria-paez 2>&1 | tail -3
echo "== matar chromium de maria =="
pkill -9 -f 'state/maria-paez/.wwebjs_auth'; echo "pkill rc=$?"
sleep 2
echo "== borrar sesión WA muerta =="
rm -rf /root/secretaria/state/maria-paez/.wwebjs_auth/session && echo "sesión borrada"
ls -la /root/secretaria/state/maria-paez/.wwebjs_auth/ 2>/dev/null
echo "== restart maria-paez (va a emitir QR nuevo) =="
pm2 restart maria-paez 2>&1 | tail -4
echo "DONE $(date -Iseconds) — ahora corré: pm2 logs maria-paez --lines 100 y escaneá el QR"
