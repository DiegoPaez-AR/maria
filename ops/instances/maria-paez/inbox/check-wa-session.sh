#!/bin/bash
# Tras el restart, maria-paez quedó pidiendo QR. Chequeo: estado del proceso,
# si está estable en QR o crash-looping, y si la sesión WA sigue en disco.
set +e
cd /root/secretaria 2>/dev/null
echo "fecha: $(date -Is)"
echo
echo "--- pm2 list ---"
pm2 list 2>/dev/null
echo
echo "--- ultimas lineas relevantes de WA ---"
pm2 logs maria-paez --lines 600 --nostream 2>/dev/null \
  | grep -E '\[WA |authenticated|ready|\[WA qr\]|loading|internal-api|SIGINT|iniciando|EADDRINUSE|disconnect' \
  | grep -v '[▄█▀]' | tail -30
echo
echo "--- :4501 ---"
ss -ltnp 2>/dev/null | grep ':4501' || echo "(nada en 4501 — WA no llegó a ready)"
echo
SD=/root/secretaria/state/maria-paez/.wwebjs_auth/session
echo "--- session dir: $SD ---"
if [ -d "$SD" ]; then
  du -sh "$SD" 2>/dev/null
  echo "contenido Default/:"
  ls -la "$SD/Default" 2>/dev/null | head -30
else
  echo "(NO existe el directorio de sesión)"
fi
