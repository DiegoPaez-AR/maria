#!/bin/bash
set +e
echo "═══ env actual (debería estar propagado) ═══"
echo "MARIA_DB=$MARIA_DB"
echo "ASISTENTE_SLUG=$ASISTENTE_SLUG"
echo "MARIA_VAULT_KEY=${MARIA_VAULT_KEY:+SETEADO}${MARIA_VAULT_KEY:-NO SETEADO}"

echo ""
echo "═══ ¿se recreó la DB legacy? ═══"
ls -la /root/secretaria/db 2>&1 | head -5
echo "Si existe y está vacía, la limpiamos en este mismo tick..."
if [ -f /root/secretaria/db/maria.sqlite ]; then
  eventos=$(sqlite3 /root/secretaria/db/maria.sqlite "SELECT COUNT(*) FROM eventos;" 2>/dev/null || echo "?")
  if [ "$eventos" = "0" ]; then
    DESTDIR="/root/secretaria/state/_old/$(date +%Y%m%d-%H%M%S)-legacy-db"
    mkdir -p "$DESTDIR"
    mv -v /root/secretaria/db "$DESTDIR/db"
    echo "Movida (fantasma re-creada por algún script con env viejo)"
  else
    echo "tiene $eventos eventos — NO mover"
  fi
else
  echo "no existe — bueno, no se recreó"
fi

echo ""
echo "═══ test node con env propagado ═══"
cd /root/secretaria && node -e "
console.log('MARIA_DB=', process.env.MARIA_DB || '(unset!)');
const u = require('./usuarios');
const lista = u.listarActivos();
console.log('listarActivos count:', lista.length);
console.log('primeros 3 nombres:', lista.slice(0,3).map(x => x.nombre).join(', '));
console.log('resolver Doris:', u.resolverPorWa('5491144471264@c.us')?.nombre || 'null');
console.log('resolver Diego sin 9:', u.resolverPorWa('541132317896@c.us')?.nombre || 'null');
console.log('resolver Enrique:', u.resolverPorWa('59899643028@c.us')?.nombre || 'null');
" 2>&1

echo ""
echo "═══ Final: ¿/root/secretaria/db existe? ═══"
ls -la /root/secretaria/db 2>&1 | head -2
