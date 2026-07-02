#!/bin/bash
echo "── contexto del fallo en cron log ──"
grep -B2 "canary FALLÓ (82695d85" /root/secretaria/ops/.cron.log | head -12
echo ""
echo "── /tmp/canary-tick.log (cola) ──"
tail -20 /tmp/canary-tick.log 2>/dev/null || echo "(no existe)"
echo FIN
