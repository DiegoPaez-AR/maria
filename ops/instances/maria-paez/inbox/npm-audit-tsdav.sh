#!/bin/bash
set +e
cd /root/secretaria

echo "═══ npm audit (detalle de las vulnerabilities actuales) ═══"
npm audit 2>&1 | head -80

echo ""
echo "═══ npm audit fix (semver-safe, NO --force) ═══"
npm audit fix 2>&1 | tail -20

echo ""
echo "═══ npm audit POST-fix ═══"
npm audit 2>&1 | head -30

echo ""
echo "═══ Smoke: tsdav + provider CalDAV siguen cargando OK ═══"
node -e "
(async () => {
  try {
    const { createDAVClient } = await import('tsdav');
    console.log('tsdav createDAVClient OK, typeof:', typeof createDAVClient);
    const c = require('./providers/caldav');
    console.log('providers/caldav exports:', Object.keys(c).length, 'incluyendo getContext:', typeof c.getContext);
    const ms = require('./providers/microsoft');
    console.log('providers/microsoft exports:', Object.keys(ms).length);
    const p = require('./providers');
    console.log('providers index:', Object.keys(p).join(','));
  } catch (err) {
    console.error('SMOKE FALLÓ:', err.message);
    process.exit(1);
  }
})();
"

echo ""
echo "═══ Versión tsdav final ═══"
node -e "console.log(require('./node_modules/tsdav/package.json').version)"
