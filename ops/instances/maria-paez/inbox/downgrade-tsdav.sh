#!/bin/bash
set -e
cd /root/secretaria

echo "═══ Desinstalar tsdav 2.x ═══"
npm uninstall tsdav 2>&1 | tail -5

echo ""
echo "═══ Instalar tsdav@1.1.6 (CJS) ═══"
npm install tsdav@1.1.6 --save 2>&1 | tail -10

echo ""
echo "═══ Versión instalada + shape ═══"
node -e "
const p = require('./node_modules/tsdav/package.json');
console.log('version:', p.version);
console.log('main:', p.main);
console.log('type:', p.type || '(implícito CJS)');
console.log('module:', p.module || '-');
console.log('exports keys:', Object.keys(p.exports || {}).slice(0,5).join(', '));
"

echo ""
echo "═══ Smoke: require + dynamic import ═══"
node -e "
(async () => {
  try {
    // Test 1: directo via require (más rápido si funciona)
    try {
      const direct = require('tsdav');
      console.log('require directo OK, exports:', Object.keys(direct).filter(k => /Client|fetch/.test(k)).slice(0,8).join(', '));
    } catch (eDir) {
      console.log('require directo falló:', eDir.message);
    }
    // Test 2: dynamic import (que es lo que usa caldav.js)
    const dyn = await import('tsdav');
    console.log('dynamic import OK, exports:', Object.keys(dyn).filter(k => /Client|fetch/.test(k)).slice(0,8).join(', '));
    // Test 3: el provider de Maria carga
    const c = require('./providers/caldav');
    console.log('providers/caldav OK,', Object.keys(c).length, 'exports');
    const p = require('./providers');
    console.log('providers/index OK,', Object.keys(p).join(', '));
  } catch (err) {
    console.error('FALLO:', err.message);
    process.exit(1);
  }
})();
"
