#!/bin/bash
set +e

echo "═══ 1. Webhook events recibidos (últimos 10) ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, event_name, procesado, COALESCE(substr(error,1,60),'') AS error, datetime(recibido_en) FROM webhook_events ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 2. Clientes en control.clientes ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, nombre, email, wa, estado, instancia_slug, instancia_usuario_id, lemon_customer_id, lemon_subscription_id, datetime(creado) FROM clientes ORDER BY id DESC;"

echo
echo "═══ 3. Usuarios nuevos en maria-paez ═══"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, nombre, email, wa_cus, activo, bienvenida_enviada, calendar_acceso, lemon_subscription_id FROM usuarios ORDER BY id DESC LIMIT 5;"

echo
echo "═══ 4. Logs intensa-api últimos webhook ═══"
pm2 logs intensa-api --lines 100 --nostream 2>&1 | grep -iE "webhook|cliente creado|signup_pending" | tail -15

echo
echo "═══ 5. Logs maria-paez bienvenida-loop ═══"
pm2 logs maria-paez --lines 200 --nostream 2>&1 | grep -iE "bienvenida|WA →usr|wa_send" | tail -20

echo
echo "═══ 6. Eventos salientes recientes en maria-paez ═══"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, datetime(timestamp), direccion, substr(de,1,20), substr(cuerpo,1,80) FROM eventos WHERE direccion='saliente' AND timestamp >= datetime('now','-15 minutes') ORDER BY id DESC LIMIT 10;"

echo
echo "═══ DONE ═══"
