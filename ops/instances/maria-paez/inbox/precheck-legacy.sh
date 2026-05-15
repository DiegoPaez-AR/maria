#!/bin/bash
# Pre-check antes de mover db/, .wwebjs_auth/, .wwebjs_cache/.
# Solo lee. Verifica que ningún código vivo apunte a esos paths.
set +e
cd /root/secretaria || exit 1

echo "═══ ¿Qué proceso tiene abierta /root/secretaria/db/maria.sqlite ahora? ═══"
fuser /root/secretaria/db/maria.sqlite /root/secretaria/db/maria.sqlite-wal 2>&1
echo "---lsof---"
lsof /root/secretaria/db/maria.sqlite /root/secretaria/db/maria.sqlite-wal 2>&1 | head -20

echo ""
echo "═══ ¿Algún proceso usa /root/secretaria/.wwebjs_auth (legacy)? ═══"
lsof +D /root/secretaria/.wwebjs_auth 2>&1 | head -10

echo ""
echo "═══ Grep código por referencias hardcoded a '/root/secretaria/db' ═══"
grep -rn "/root/secretaria/db" /root/secretaria/*.js /root/secretaria/ecosystem.config.js 2>/dev/null | grep -v node_modules | grep -v "//"

echo ""
echo "═══ Grep código por defaults de DB sin env var ═══"
grep -nE "(db/maria\\.sqlite|MARIA_DB|maria\\.sqlite)" /root/secretaria/*.js 2>/dev/null | grep -v node_modules | head -30

echo ""
echo "═══ Grep código por '.wwebjs_auth' ═══"
grep -nE "\\.wwebjs_auth" /root/secretaria/*.js 2>/dev/null | grep -v node_modules

echo ""
echo "═══ Grep código por WA_AUTH_DIR fallback ═══"
grep -nE "WA_AUTH_DIR" /root/secretaria/*.js 2>/dev/null | grep -v node_modules

echo ""
echo "═══ Cron tab actual (¿algo más que cron-master.sh?) ═══"
crontab -l 2>/dev/null

echo ""
echo "═══ pm2 status final ═══"
pm2 list 2>/dev/null | head -10

echo ""
echo "═══ Eventos recientes (post-restart) ═══"
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" 'SELECT id, timestamp, canal, direccion, substr(COALESCE(cuerpo,""),1,80) FROM eventos WHERE timestamp >= "2026-05-15 08:50" ORDER BY id DESC LIMIT 20' 2>&1
