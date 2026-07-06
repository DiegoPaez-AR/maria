#!/bin/bash
command -v strace >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y strace >/dev/null 2>&1
PID=$(pm2 pid maria-paez 2>/dev/null | tail -1)
echo "trazando pid=$PID (espero el SIGINT ~10s)…"
timeout 20 strace -p "$PID" -e trace=signal -f 2>&1 | grep -m3 "SIGINT" | head -3
echo "── quién es el si_pid ──"
SIPID=$(timeout 20 strace -p "$(pm2 pid maria-paez 2>/dev/null | tail -1)" -e trace=signal 2>&1 | grep -m1 -oE "si_pid=[0-9]+" | cut -d= -f2)
if [ -n "$SIPID" ]; then
  echo "si_pid=$SIPID:"
  ps -o pid,ppid,etime,cmd -p "$SIPID" 2>/dev/null || echo "(ya murió — era efímero)"
  PPID2=$(ps -o ppid= -p "$SIPID" 2>/dev/null | tr -d ' ')
  [ -n "$PPID2" ] && echo "padre:" && ps -o pid,ppid,etime,cmd -p "$PPID2" 2>/dev/null
fi
echo LISTO
