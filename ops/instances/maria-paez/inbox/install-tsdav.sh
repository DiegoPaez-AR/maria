#!/bin/bash
set -e
cd /root/secretaria
echo "═══ npm install tsdav ═══"
npm install tsdav --save 2>&1 | tail -15

echo ""
echo "═══ tsdav version instalada ═══"
node -e "console.log(require('./node_modules/tsdav/package.json').version)" 2>&1

echo ""
echo "═══ Smoke: ¿el provider caldav carga sin errores? ═══"
node -e "
(async () => {
  try {
    const c = require('./providers/caldav');
    console.log('caldav module OK, exports:', Object.keys(c).join(', '));
    // forzar import dinámico de tsdav
    const tsdavMod = await import('tsdav');
    console.log('tsdav import OK, exports principales:', Object.keys(tsdavMod).filter(k => /Client|Account|fetch/.test(k)).slice(0, 10).join(', '));
  } catch (err) {
    console.error('FALLO:', err.message);
    process.exit(1);
  }
})();
" 2>&1

echo ""
echo "═══ providers/index.js carga ═══"
node -e "const p = require('./providers'); console.log('OK, factory exports:', Object.keys(p).join(', '));" 2>&1
