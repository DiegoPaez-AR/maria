#!/bin/bash
set +e
echo "═══ 1. Restart intensa-api con fix ═══"
pm2 restart intensa-api --update-env 2>&1 | tail -3
sleep 4

echo
echo "═══ 2. Test webhook con firma fake (debe responder 401 no 500) ═══"
curl -sk -X POST -H "Content-Type: application/json" -H "X-Signature: fake-sig" \
  -d '{"meta":{"event_name":"test","webhook_id":"test"},"data":{}}' \
  https://intensa.io/maria/api/webhook -w "\nHTTP %{http_code}\n"

echo
echo "═══ 3. Test webhook con firma válida (HMAC-SHA256 del body con secret real) ═══"
SECRET=$(grep '^LEMON_WEBHOOK_SECRET=' /root/secretaria/.env-intensa-api | cut -d= -f2-)
BODY='{"meta":{"event_name":"test_event","webhook_id":"test-manual-001"},"data":{"id":"42","attributes":{}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
echo "  secret=${SECRET:0:8}... sig=${SIG:0:12}..."
curl -sk -X POST -H "Content-Type: application/json" -H "X-Signature: $SIG" \
  -d "$BODY" https://intensa.io/maria/api/webhook -w "\nHTTP %{http_code}\n"

echo
echo "═══ 4. Verificar webhook_events tabla post-test ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, event_name, procesado, COALESCE(error,''), datetime(recibido_en) FROM webhook_events ORDER BY id DESC LIMIT 5;"

echo
echo "═══ 5. Logs intensa-api post-tests ═══"
pm2 logs intensa-api --lines 25 --nostream 2>&1 | tail -15

echo
echo "═══ 6. Si Diego ya tiene una subscription real en LS, vamos a re-trigerar el webhook ═══"
echo "  (esto requiere ir al dashboard LS y hacer click 'Resend' en el webhook fallido)"
echo "  Logs de webhooks recientes a /webhook:"
pm2 logs intensa-api --lines 200 --nostream 2>&1 | grep "POST /webhook" | tail -10

echo
echo "═══ DONE ═══"
