#!/bin/bash
cd /root/secretaria
echo "── ticks del cron 04:15 → 05:05 local (solo lo anómalo) ──"
timeout 20 awk '/═══ 2026-09-03T04:1[5-9]/,/═══ 2026-09-03T05:0[5-9]/' ops/.cron.log | grep -vE "^push fase 1 OK$|^tick done$" | head -60
echo ""
echo "── ¿hubo ticks que NO terminaron (═══ sin tick done)? ──"
timeout 20 awk '/═══ 2026-09-03T04:1/,/═══ 2026-09-03T05:1/' ops/.cron.log | grep -cE "^═══"
timeout 20 awk '/═══ 2026-09-03T04:1/,/═══ 2026-09-03T05:1/' ops/.cron.log | grep -cE "^tick done"
echo "── healthcheck log (si existe) ──"
ls /root/secretaria/ops/*.log 2>/dev/null; tail -20 /root/secretaria/ops/.healthcheck.log 2>/dev/null
echo "── syslog: cron / oom / kill a esa hora ──"
timeout 10 grep -E "Sep  3 04:[2-5]|Sep  3 05:0" /var/log/syslog 2>/dev/null | grep -iE "oom|kill|cron.*maria|error" | head -10
echo LISTO
