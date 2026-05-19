#!/bin/bash
set +e
echo "═══ Limpiando signup_pending viejos de Diego para poder reintentar limpio ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, email, wa, datetime(creado), datetime(expira_en) FROM signup_pending WHERE email LIKE 'diego%' OR wa LIKE '%132317896';"
sqlite3 /root/secretaria/state/control/control.sqlite \
  "DELETE FROM signup_pending WHERE email LIKE 'diego%' OR wa LIKE '%132317896';"
echo
echo "═══ Limpiar también webhook test event y signup_pending de tests ═══"
sqlite3 /root/secretaria/state/control/control.sqlite \
  "DELETE FROM webhook_events WHERE event_name='test_event';
   DELETE FROM signup_pending WHERE email LIKE '%invalid%' OR email LIKE '%@test.invalid%';"
echo
echo "═══ Estado actual ═══"
echo "  signup_pending:"
sqlite3 /root/secretaria/state/control/control.sqlite "SELECT COUNT(*) FROM signup_pending;"
echo "  clientes:"
sqlite3 /root/secretaria/state/control/control.sqlite "SELECT COUNT(*) FROM clientes;"
echo "  webhook_events:"
sqlite3 /root/secretaria/state/control/control.sqlite "SELECT COUNT(*) FROM webhook_events;"
echo
echo "═══ DONE — Diego puede reintentar signup limpio ahora ═══"
