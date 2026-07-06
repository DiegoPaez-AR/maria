#!/bin/bash
systemctl start auditd 2>/dev/null
auditctl -D 2>/dev/null >/dev/null
auditctl -a exit,always -F arch=b64 -S kill -k caza2 2>&1
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print('antes:', p['pm2_env']['restart_time']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
sleep 25
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print('después:', p['pm2_env']['restart_time']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "── raw ausearch (kills con a1=0x2 = SIGINT) ──"
ausearch -k caza2 2>/dev/null | grep -A2 "syscall=62" | grep -E "a1=0x2|exe=|comm=" | head -20
echo "── si vacío, TODO el raw ──"
ausearch -k caza2 2>/dev/null | tail -25
auditctl -D 2>/dev/null >/dev/null
echo LISTO
