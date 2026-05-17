#!/bin/bash
set +e
echo "═══ pm2 status maria-paez ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print(json.dumps({"pid":r["pid"],"status":r["pm2_env"]["status"],"restart_time":r["pm2_env"]["restart_time"],"uptime_ms":r["pm2_env"]["pm_uptime"]} if r else {"err":"no encontre"}, indent=2))'
echo ""
echo "═══ Hash de wa-validate.js (¿lo pulleó?) ═══"
md5sum /root/secretaria/wa-validate.js 2>&1
ls -la /root/secretaria/wa-validate.js 2>&1
echo ""
echo "═══ Hash de executor.js (¿cambió?) ═══"
md5sum /root/secretaria/executor.js 2>&1
grep -c "waValidate" /root/secretaria/executor.js 2>&1
echo ""
echo "═══ pm2 logs ultimas 30 lineas — errores post-reload ═══"
pm2 logs maria-paez --lines 30 --nostream 2>&1 | tail -30
