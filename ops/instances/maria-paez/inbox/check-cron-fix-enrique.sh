#!/bin/bash
echo "═══ cron log últimas 80 ═══"
tail -120 /root/secretaria/ops/.cron.log 2>&1 | tail -80
echo ""
echo "═══ verificar estado actual de Enrique ═══"
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
sqlite3 -header -column "$DB" "SELECT id, nombre, wa_cus FROM usuarios WHERE id=12; SELECT id, nombre, whatsapp FROM contactos WHERE id=209;"
