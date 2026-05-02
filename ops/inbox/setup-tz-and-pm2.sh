#!/bin/bash
# setup-tz-and-pm2.sh — one-shot:
#   1) setea TZ del VPS a America/Argentina/Buenos_Aires si hace falta
#   2) recrea el proceso pm2 'maria' usando ecosystem.config.js
#      (para que tome log_date_format y TZ)
#   3) reporta estado final
#
# Idempotente: si ya está todo bien, no rompe nada.

set -u

echo "=== TZ ANTES ==="
timedatectl 2>&1 | grep -E "Time zone|Local time" || true
date

CURRENT_TZ=$(timedatectl show --value -p Timezone 2>/dev/null || cat /etc/timezone 2>/dev/null || echo unknown)
TARGET_TZ="America/Argentina/Buenos_Aires"

if [ "$CURRENT_TZ" != "$TARGET_TZ" ]; then
  echo ""
  echo ">> TZ actual ($CURRENT_TZ) != $TARGET_TZ → seteando"
  timedatectl set-timezone "$TARGET_TZ" 2>&1
else
  echo ""
  echo ">> TZ ya es $TARGET_TZ — sin cambios"
fi

echo ""
echo "=== TZ DESPUES ==="
timedatectl 2>&1 | grep -E "Time zone|Local time" || true
date

echo ""
echo "=== pm2 describe maria (ANTES) ==="
pm2 describe maria 2>&1 | grep -E "script path|exec mode|status|cwd|out log|error log|created at|restart" || pm2 describe maria 2>&1 | head -40

cd /root/secretaria || { echo "no se pudo cd a /root/secretaria"; exit 1; }

if [ ! -f ecosystem.config.js ]; then
  echo ""
  echo "ERROR: no existe ecosystem.config.js en /root/secretaria — abortando"
  exit 1
fi

echo ""
echo "=== ecosystem.config.js ==="
cat ecosystem.config.js

echo ""
echo "=== Deploy: delete + start con ecosystem ==="
pm2 delete maria 2>&1 || echo "(maria no existía, ok)"
pm2 start ecosystem.config.js 2>&1
pm2 save 2>&1

echo ""
echo ">> esperando 8s para que arranque..."
sleep 8

echo ""
echo "=== pm2 list (DESPUES) ==="
pm2 list 2>&1

echo ""
echo "=== pm2 describe maria (DESPUES) ==="
pm2 describe maria 2>&1 | grep -E "script path|exec mode|status|cwd|out log|error log|node args|env: TZ|TZ:" | head -20

echo ""
echo "=== pm2 logs maria (DESPUES, 30 lineas) ==="
pm2 logs maria --lines 30 --nostream 2>&1 | tail -40

echo ""
echo "=== fin ==="
