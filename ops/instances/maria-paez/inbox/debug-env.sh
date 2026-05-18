#!/bin/bash
set +e
echo "═══ env MARIA_DB en este shell ═══"
echo "MARIA_DB=$MARIA_DB"
echo "ASISTENTE_SLUG=$ASISTENTE_SLUG"
echo ""
echo "═══ env desde node (con default fallback) ═══"
cd /root/secretaria && node -e "
console.log('process.env.MARIA_DB =', process.env.MARIA_DB || '(unset)');
console.log('__dirname:', __dirname);
const path = require('path');
const def = path.join(__dirname, 'db', 'maria.sqlite');
console.log('DB default que usaría sin env:', def);
const fs = require('fs');
console.log('¿Existe la DB default?', fs.existsSync(def));
const realPath = process.env.MARIA_DB || def;
console.log('DB que va a abrir:', realPath);
console.log('¿Existe?', fs.existsSync(realPath));
" 2>&1
echo ""
echo "═══ Veamos cómo cron-master setea env ═══"
grep -n "export\|set -a\|MARIA_DB" /root/secretaria/ops/cron-master.sh | head -10
