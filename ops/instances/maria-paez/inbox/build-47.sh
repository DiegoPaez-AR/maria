#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
echo "HEAD: $(git rev-parse --short HEAD)"
grep -c "mbverif" internal-api.js
pm2 jlist | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"][0]; print("pm2 pid",d["pid"],"restarts",d["pm2_env"]["restart_time"],"uptime_s",int((__import__("time").time()*1000-d["pm2_env"]["pm_uptime"])/1000))'
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v4.7 lanzado"; fi
