#!/bin/bash
set +e
echo "═══ pm2 logs intensa-api últimas 30 líneas SQLite ═══"
pm2 logs intensa-api --lines 100 --nostream 2>&1 | grep -iE "SQLITE|cuenta/login|portal_otp|ERROR|portal_sessions" | tail -20

echo
echo "═══ Verificar schema actual de portal_otp ═══"
sqlite3 /root/secretaria/state/control/control.sqlite ".schema portal_otp"

echo
echo "═══ Verificar schema actual de clientes (post recreate v2) ═══"
sqlite3 /root/secretaria/state/control/control.sqlite ".schema clientes" | head -30

echo
echo "═══ INSERT manual para reproducir el error ═══"
sqlite3 /root/secretaria/state/control/control.sqlite \
  "INSERT INTO portal_otp (cliente_id, canal, code, expira_en) VALUES (1, 'email', '123456', datetime('now','+10 minutes'));" 2>&1

echo
echo "═══ portal_otp tras INSERT ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT * FROM portal_otp WHERE cliente_id=1;"

echo
echo "═══ Probar /cuenta/login con captcha=skip (deja ver el flow completo) ═══"
# El backend va a fallar el captcha pero igual loguea el error real si hubiera SQLITE upstream
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"canal":"email","identificador":"diego@paez.is","turnstile_token":"skip"}' \
  https://intensa.io/maria/api/cuenta/login
echo
echo
echo "═══ logs post-test ═══"
sleep 1
pm2 logs intensa-api --lines 30 --nostream 2>&1 | tail -15

echo
echo "═══ DONE ═══"
