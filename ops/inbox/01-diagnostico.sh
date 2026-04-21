#!/bin/bash
# Primer test del canal inbox: diagnóstico general del VPS.
# Objetivo: confirmar que el cron toma este script, lo ejecuta,
# y deja el output en ops/outbox/01-diagnostico.out

echo "=== uname / uptime ==="
uname -a
uptime

echo ""
echo "=== disco ==="
df -h / | tail -1

echo ""
echo "=== memoria ==="
free -h

echo ""
echo "=== pm2 list ==="
pm2 list 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g'

echo ""
echo "=== crontab -l ==="
crontab -l

echo ""
echo "=== tamaño db ==="
ls -lh /root/secretaria/db/maria.sqlite 2>/dev/null || echo "db no encontrada en path esperado"

echo ""
echo "=== últimos 5 eventos en maria.sqlite ==="
sqlite3 /root/secretaria/db/maria.sqlite \
  'SELECT id, timestamp, canal, direccion, substr(COALESCE(cuerpo,""),1,80) FROM eventos ORDER BY id DESC LIMIT 5' 2>&1

echo ""
echo "=== git status del repo ==="
cd /root/secretaria && git log --oneline -5 && git status --short
