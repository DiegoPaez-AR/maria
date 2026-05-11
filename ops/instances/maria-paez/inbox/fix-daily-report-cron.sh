#!/bin/bash
set +e
cd /root/secretaria

echo "── 1. ¿Dónde está node de verdad? ──"
echo "which node:        $(which node)"
echo "command -v node:   $(command -v node)"
echo "/usr/bin/node:     $(ls -la /usr/bin/node 2>&1)"
echo "/usr/local/bin/node: $(ls -la /usr/local/bin/node 2>&1)"
echo "Realpath which node: $(readlink -f $(which node) 2>&1)"
node -v 2>&1
echo

echo "── 2. Limpiar entrada vieja mal formada de daily-report ──"
crontab -l 2>&1 | grep -v 'daily-report.js' | crontab -
echo "limpio:"
crontab -l 2>&1
echo

echo "── 3. Detectar node bin que va a usar el cron ──"
# Cron corre con PATH limitado. El cron-master se las arregla seteando PATH con NVM,
# pero acá querés un binario absoluto que SIEMPRE exista.
NODE_BIN=$(readlink -f $(which node) 2>/dev/null)
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  # Fallbacks
  for cand in /usr/bin/node /usr/local/bin/node /root/.nvm/versions/node/*/bin/node; do
    if [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
  done
fi
echo "NODE_BIN final = $NODE_BIN"
$NODE_BIN -v
echo

echo "── 4. Instalar entrada nueva ──"
CRON_LINE="0 6 * * * cd /root/secretaria && $NODE_BIN daily-report.js >> /root/secretaria/ops/.daily-report.log 2>&1"
(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
echo "agregado: $CRON_LINE"
echo

echo "── 5. crontab final ──"
crontab -l 2>&1
echo

echo "── 6. Mandar reporte de HOY ──"
cd /root/secretaria && $NODE_BIN daily-report.js 2>&1 | tail -50
echo

echo "── 7. Confirmar ──"
ls -la /root/secretaria/ops/.daily-report.log 2>&1
echo "fin"
