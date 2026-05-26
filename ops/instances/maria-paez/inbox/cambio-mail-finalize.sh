#!/bin/bash
# Fase 4 atómica del cambio de mail de Maria:
#   1. Backup del token cifrado y del .conf.
#   2. Intercambio del OAuth code → token nuevo cifrado para maria.paez@intensa.io.
#   3. Edit del .conf con la dirección nueva.
#   4. pm2 reload --update-env para que el proceso vivo agarre el env nuevo.
#   5. Smoke: g.MARIA_EMAIL + listarCalendarios.
set -euo pipefail

CODE='4/0AeoWuM8tm_bV2WkaUenNJm5N8TOua4rr-f6nnkDzpVvBwsUzg8hyqiRkAhLTgXBWuGph6Q'
NEW_EMAIL='maria.paez@intensa.io'
SLUG='maria-paez'
CONF="/root/secretaria/config/instances/${SLUG}.conf"
STATE="/root/secretaria/state/${SLUG}"
STAMP=$(date +%Y%m%dT%H%M%S)

cd /root/secretaria

echo "── 1. Backup ──"
if [ -f "${STATE}/token.json.enc" ]; then
  cp -p "${STATE}/token.json.enc" "${STATE}/token.json.enc.bak.${STAMP}"
  echo "  token.json.enc → token.json.enc.bak.${STAMP}"
fi
cp -p "${CONF}" "${CONF}.bak.${STAMP}"
echo "  .conf            → .conf.bak.${STAMP}"

echo
echo "── 2. Exchange OAuth code ──"
node auth-gmail.js exchange "${CODE}"

echo
echo "── 3. Update .conf: ASISTENTE_FROM_EMAIL=${NEW_EMAIL} ──"
sed -i "s|^ASISTENTE_FROM_EMAIL=.*|ASISTENTE_FROM_EMAIL=${NEW_EMAIL}|" "${CONF}"
grep -E '^ASISTENTE_(FROM_EMAIL|NOMBRE|SLUG|TZ)=' "${CONF}"

echo
echo "── 4. pm2 reload --update-env ──"
pm2 reload ecosystem.config.js --only "${SLUG}" --update-env
sleep 3
pm2 list | grep -E "name|${SLUG}" || true

echo
echo "── 5. Smoke (env recargado desde .conf nuevo) ──"
set -a; . "${CONF}"; set +a
node -e "
process.chdir('/root/secretaria');
const g = require('./google');
console.log('FROM_EMAIL del módulo:', g.MARIA_EMAIL);
(async () => {
  try {
    const cals = await g.listarCalendarios();
    console.log('✓ listarCalendarios OK, n=' + cals.length);
    const ids = cals.slice(0, 6).map(c => c.id || c.summary);
    console.log('  ejemplos:', ids.join(' | '));
  } catch (e) {
    console.error('✗ listarCalendarios FALLÓ:', e.message);
    process.exit(1);
  }
})();
"

echo
echo "── done ──"
