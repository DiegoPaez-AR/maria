#!/bin/bash
cd /root/secretaria
echo "── hora del VPS ──"; date
echo "── TODO lo que dijo el barrido ──"
timeout 15 grep -E "barrido|RECUPERO" /root/.pm2/logs/maria-paez-out.log | tail -20
echo ""
echo "── ¿el listener sigue vivo? últimas notifs vistas ──"
timeout 15 grep -E "\[MB.*\[notif\]" /root/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
