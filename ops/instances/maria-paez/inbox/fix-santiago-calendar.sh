#!/bin/bash
# Fix operacional para Santiago Bignone (id=5): poblar calendar_id +
# autodetectar accessRole. Es el caso real que disparó los fixes A+B —
# Santiago compartió su calendar el 14-may pero su calendar_id quedó vacío.
set +e

# Cargar env del .conf (export auto)
set -a
. /root/secretaria/config/instances/maria-paez.conf
set +a

cd /root/secretaria

CAL_ID="santiagocbignone@gmail.com"
USR_ID=5

echo "═══ Estado ANTES ═══"
sqlite3 -header -column "$MARIA_DB" "SELECT id, nombre, calendar_id, calendar_acceso FROM usuarios WHERE id = $USR_ID"

echo ""
echo "═══ 1) UPDATE calendar_id ═══"
sqlite3 "$MARIA_DB" "UPDATE usuarios SET calendar_id = '$CAL_ID', actualizado = CURRENT_TIMESTAMP WHERE id = $USR_ID"
echo "✓ calendar_id seteado a $CAL_ID"

echo ""
echo "═══ 2) Autodetect accessRole vía google.chequearAccesoCalendar ═══"
DETECTED=$(node -e "
(async () => {
  try {
    const g = require('./google');
    const r = await g.chequearAccesoCalendar('$CAL_ID');
    console.log(r);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
" 2>&1)

echo "Detectado: $DETECTED"

if [ "$DETECTED" = "none" ] || [ "$DETECTED" = "read" ] || [ "$DETECTED" = "write" ]; then
  echo ""
  echo "═══ 3) UPDATE calendar_acceso a '$DETECTED' ═══"
  sqlite3 "$MARIA_DB" "UPDATE usuarios SET calendar_acceso = '$DETECTED', actualizado = CURRENT_TIMESTAMP WHERE id = $USR_ID"
  echo "✓ calendar_acceso seteado a $DETECTED"

  echo ""
  echo "═══ 4) Loggear evento ═══"
  sqlite3 "$MARIA_DB" "INSERT INTO eventos (timestamp, usuario_id, canal, direccion, cuerpo, metadata_json) VALUES (CURRENT_TIMESTAMP, $USR_ID, 'sistema', 'interno', 'calendar_id y calendar_acceso seteados manualmente: $CAL_ID / $DETECTED (fix operacional Diego/Claude 2026-05-15)', '{\"fuente\":\"fix-operacional\"}')"
  echo "✓ evento loggeado"
else
  echo "✗ DETECTED no es none/read/write — algo falló. NO actualizo calendar_acceso."
fi

echo ""
echo "═══ Estado DESPUÉS ═══"
sqlite3 -header -column "$MARIA_DB" "SELECT id, nombre, calendar_id, calendar_acceso, actualizado FROM usuarios WHERE id = $USR_ID"
