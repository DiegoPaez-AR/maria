#!/bin/bash
set -u
API=/root/secretaria/ops/backend/intensa-api
echo "## cómo carga el env intensa-api (grep dotenv/env-intensa):"
grep -rInE "dotenv|env-intensa|\.env" "$API"/index.js "$API"/*.js 2>/dev/null | head -20
echo
echo "## test: Node parsea STRIPE_WEBHOOK_SECRET desde el .env-intensa-api"
cd "$API"
node -e "
try {
  require('dotenv').config({ path: '/root/secretaria/.env-intensa-api' });
  const v = process.env.STRIPE_WEBHOOK_SECRET || '';
  console.log('STRIPE_WEBHOOK_SECRET visible a Node:', v ? 'SI' : 'NO', '| len=', v.length, '| prefix=', v.slice(0,6));
  console.log('LEMON_WEBHOOK_SECRET aún presente:', !!process.env.LEMON_WEBHOOK_SECRET);
} catch(e){ console.log('err', e.message); }
"
