#!/bin/bash
# Mover la DB legacy /root/secretaria/db/maria.sqlite a state/_old/<timestamp>
# definitivamente. Solo si está vacía (0 eventos / 0 contactos).
# Tras el fix del cron-master.sh, los scripts del inbox ya no la recrean.
set +e
LEGACY="/root/secretaria/db/maria.sqlite"
DESTDIR="/root/secretaria/state/_old/$(date +%Y%m%d-%H%M%S)-legacy-db"

if [ ! -f "$LEGACY" ]; then
  echo "no existe $LEGACY — nada que limpiar"
  exit 0
fi

eventos=$(sqlite3 "$LEGACY" "SELECT COUNT(*) FROM eventos;" 2>/dev/null || echo "?")
contactos=$(sqlite3 "$LEGACY" "SELECT COUNT(*) FROM contactos;" 2>/dev/null || echo "?")
usuarios=$(sqlite3 "$LEGACY" "SELECT COUNT(*) FROM usuarios;" 2>/dev/null || echo "?")

echo "═══ Estado antes de mover ═══"
echo "  eventos:   $eventos"
echo "  contactos: $contactos"
echo "  usuarios:  $usuarios"

if [ "$eventos" != "0" ] || [ "$contactos" != "0" ]; then
  echo "✗ DB legacy tiene data — NO la muevo, abortando para preservar"
  exit 1
fi

echo ""
echo "═══ Mover legacy a $DESTDIR ═══"
mkdir -p "$DESTDIR"
mv -v /root/secretaria/db "$DESTDIR/db"

echo ""
echo "═══ ¿Quedó algo en /root/secretaria/db? ═══"
ls -la /root/secretaria/db 2>&1 | head -3

echo ""
echo "═══ Re-test: ahora node -e 'require(memory)' ya NO debería poder crear DB fantasma ═══"
# Sin MARIA_DB en env y sin db/ dir, better-sqlite3 va a crear el dir y la DB.
# Si tras este script alguien ejecuta node sin env propagado, se vuelve a crear.
# El fix preventivo es exportar env en el cron-master (ya pusheado).
