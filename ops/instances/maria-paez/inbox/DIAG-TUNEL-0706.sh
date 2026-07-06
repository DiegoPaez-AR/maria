#!/bin/bash
echo "== listeners 1080 =="
ss -tlnp | grep 1080 || echo "(nadie escucha en 1080)"
echo; echo "== sshd de tuneles (notty) =="
ps aux | grep -E "sshd.*notty" | grep -v grep || echo "(ninguno)"
echo; echo "== conexiones ssh recientes =="
grep -iE "accepted|disconnect" /var/log/auth.log 2>/dev/null | tail -12 || journalctl -u ssh --since "-6 hours" 2>/dev/null | grep -iE "accepted|disconnect" | tail -12
echo; echo "== sshd keepalive config =="
grep -iE "clientalive" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null || echo "(sin ClientAlive configurado)"
