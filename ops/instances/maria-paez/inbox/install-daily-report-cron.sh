#!/bin/bash
set +e
cd /root/secretaria

echo "── 1. Resolver path de node ──"
NODE_BIN="/root/.nvm/versions/node/$(ls /root/.nvm/versions/node | tail -1)/bin/node"
echo "node = $NODE_BIN"
$NODE_BIN -v

echo
echo "── 2. crontab ANTES ──"
crontab -l 2>&1

echo
echo "── 3. Agregar entrada daily-report 06:00 ART (si no existe) ──"
CRON_LINE="0 6 * * * cd /root/secretaria && $NODE_BIN daily-report.js >> /root/secretaria/ops/.daily-report.log 2>&1"
if crontab -l 2>/dev/null | grep -qF "daily-report.js"; then
  echo "ya existe entrada de daily-report — no toco"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "agregado: $CRON_LINE"
fi

echo
echo "── 4. crontab DESPUÉS ──"
crontab -l 2>&1

echo
echo "── 5. Mandar el reporte de HOY (única vez) ──"
$NODE_BIN daily-report.js 2>&1 | tail -40

echo
echo "── 6. Confirmar log ──"
ls -la /root/secretaria/ops/.daily-report.log 2>&1
tail -5 /root/secretaria/ops/.daily-report.log 2>&1

echo "fin"
