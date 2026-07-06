#!/bin/bash
echo "── pm2 daemon log (exits) ──"
grep -E "maria-paez.*(exited|restart|signal)" /root/.pm2/pm2.log | tail -8
echo "── procesos node vivos (¿zombie?) ──"
ps aux | grep -E "node|chrom" | grep -v grep | awk '{print $2, $11, $12}' | head -10
echo "── puerto 4501 ──"
ss -ltnp 2>/dev/null | grep 4501
echo "── unhandled en error log (sin las líneas degradado) ──"
grep -vE "MODO DEGRADADO" /root/.pm2/logs/maria-paez-error.log | tail -20
echo LISTO
