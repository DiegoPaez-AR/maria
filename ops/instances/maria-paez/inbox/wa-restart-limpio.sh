#!/bin/bash
set +e
echo "== procesos chromium usando el profile de maria (antes) =="
pgrep -af 'state/maria-paez/.wwebjs_auth' | head -20
echo ""
echo "== mato SOLO el/los chromium con el profile de maria =="
pkill -9 -f 'state/maria-paez/.wwebjs_auth'; echo "pkill rc=$?"
sleep 3
echo "== quedó alguno? =="
pgrep -af 'state/maria-paez/.wwebjs_auth' | head || echo "(ninguno)"
echo ""
echo "== restart maria-paez via pm2 =="
pm2 restart maria-paez 2>&1 | tail -6
echo "DONE $(date -Iseconds)"
