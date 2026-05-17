#!/bin/bash
# Diag caso Enrique: maria 17:13 dijo "doy de alta + mando bienvenida",
# 17:23 admitió que falló envío WA. Identificar causa real.
set +e
source /root/secretaria/config/instances/maria-paez.conf 2>/dev/null
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ DB: $DB ═══"
ls -la "$DB" 2>/dev/null | head -1

echo ""
echo "═══ Usuario Enrique ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, email, wa_id, calendar_provider, datetime(creado_en) AS creado FROM usuarios WHERE LOWER(nombre) LIKE '%nrique%' OR LOWER(email) LIKE '%nrique%';"

echo ""
echo "═══ Contacto Enrique (libreta del owner) ═══"
sqlite3 -header -column "$DB" "SELECT id, usuario_id, nombre, email, wa_id, numero_wa, datetime(creado_en) AS creado FROM contactos WHERE LOWER(nombre) LIKE '%nrique%' OR LOWER(email) LIKE '%nrique%' OR email LIKE '%globalnet%';"

echo ""
echo "═══ Schema usuarios (por las dudas: campos disponibles) ═══"
sqlite3 "$DB" ".schema usuarios" | head -20

echo ""
echo "═══ Eventos relacionados a Enrique últimas 8h ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp) AS ts, canal, direccion, substr(de,1,28) AS de, substr(para,1,28) AS para, substr(cuerpo,1,160) AS msg FROM eventos WHERE timestamp >= datetime('now','-8 hours') AND (cuerpo LIKE '%nrique%' OR cuerpo LIKE '%globalnetmobile%' OR cuerpo LIKE '%Sosa%' OR cuerpo LIKE '%sosa%') ORDER BY timestamp ASC LIMIT 80;"

echo ""
echo "═══ Eventos canal=sistema relacionados — crear_usuario / onboarding / send ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp) AS ts, substr(cuerpo,1,300) AS msg FROM eventos WHERE timestamp >= datetime('now','-8 hours') AND canal='sistema' AND (cuerpo LIKE '%crear_usuario%' OR cuerpo LIKE '%onboarding%' OR cuerpo LIKE '%bienvenida%' OR cuerpo LIKE '%getNumberId%' OR cuerpo LIKE '%wid%' OR cuerpo LIKE '%wa-send%') ORDER BY timestamp ASC LIMIT 40;"

echo ""
echo "═══ pm2 logs últimas 2000 líneas filtradas Enrique/Sosa/globalnetmobile ═══"
pm2 logs maria-paez --lines 2000 --nostream 2>&1 | grep -iE "enrique|globalnetmobile|sosa" | tail -100

echo ""
echo "═══ pm2 logs — errores envío WA (cualquier destino) últimas 2000 líneas ═══"
pm2 logs maria-paez --lines 2000 --nostream 2>&1 | grep -iE "no se pudo enviar|sendMessage.*err|wid no|getNumberId.*null|enviar.*fall|wa.send.*err|wa.send.*fail" | tail -40

echo ""
echo "═══ DONE ═══"
