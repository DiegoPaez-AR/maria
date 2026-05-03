#!/bin/bash
# Bump whatsapp-web.js de 1.34.6 -> ^1.34.7 para intentar mitigar el bug
# `Cannot read properties of undefined (reading 'waitForChatLoading')` que
# saltaba en context-fetcher.historialWA cada vez que un @lid desconocido
# escribía. La gestión funcionaba igual (degradación silenciosa con
# hist_wa=0) pero el LLM pre-pass quedaba sin historial real con el remitente.
#
# El cambio cosmético en context-fetcher.js (split('\n')[0]) ya viene en este
# mismo deploy.

set -e
cd /root/secretaria

echo "═══ versión actual ═══"
node -e "console.log(require('whatsapp-web.js/package.json').version)" 2>&1 || echo "(no instalada)"

echo ""
echo "═══ npm install whatsapp-web.js@^1.34.7 ═══"
npm install whatsapp-web.js@^1.34.7 --save 2>&1 | tail -15

echo ""
echo "═══ versión nueva ═══"
node -e "console.log(require('whatsapp-web.js/package.json').version)"

echo ""
echo "═══ pm2 restart maria ═══"
pm2 restart maria --update-env
sleep 3
pm2 jlist | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] == 'maria':
        e = p.get('pm2_env', {})
        print(f\"status={e.get('status')} restarts={e.get('restart_time')} pid={p.get('pid')}\")
"

echo ""
echo "═══ últimos 8 logs post-restart ═══"
pm2 logs maria --lines 8 --nostream 2>&1 | tail -10

echo ""
echo "═══ commit + push package.json/package-lock.json ═══"
git add package.json package-lock.json
if git diff --cached --quiet; then
  echo "(sin cambios para commitear)"
else
  git commit -q -m "deps: bump whatsapp-web.js -> ^1.34.7 (mitiga waitForChatLoading)"
  if git push -q origin main; then
    echo "push OK"
  else
    git pull --rebase --autostash -q origin main 2>&1 | tail -3
    git push -q origin main && echo "push OK (post-rebase)" || echo "push FAIL — el cron lo recoge en el próximo tick"
  fi
fi

echo ""
echo "═══ done ═══"
