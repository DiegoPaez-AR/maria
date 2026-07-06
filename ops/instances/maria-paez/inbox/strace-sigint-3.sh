#!/bin/bash
echo "── barrido de procesos sospechosos ──"
ps auxww | grep -viE "grep|snapshots" | grep -iE "sleep|while|restart|relink" | head -6
systemctl list-timers --no-pager 2>/dev/null | head -6
echo "── strace a archivo (30s) ──"
PID=$(pm2 pid maria-paez 2>/dev/null | tail -1)
echo "pid inicial: $PID"
timeout 30 strace -p "$PID" -e trace=signal -o /tmp/st-sig.txt 2>/dev/null
echo "── señales entregadas ──"
grep -E "^--- SIG" /tmp/st-sig.txt | head -5
echo "── detalle del emisor ──"
SIPID=$(grep -m1 -oE "si_pid=[0-9]+" /tmp/st-sig.txt | cut -d= -f2)
if [ -n "$SIPID" ]; then
  echo "si_pid=$SIPID"
  ps -o pid,ppid,etime,cmd -p "$SIPID" 2>/dev/null || echo "(efímero, ya murió)"
  P2=$(ps -o ppid= -p "$SIPID" 2>/dev/null | tr -d ' ')
  [ -n "$P2" ] && ps -o pid,ppid,etime,cmd -p "$P2" 2>/dev/null
fi
rm -f /tmp/st-sig.txt
echo LISTO
