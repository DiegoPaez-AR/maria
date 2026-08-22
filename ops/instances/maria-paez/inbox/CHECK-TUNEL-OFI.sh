#!/bin/bash
echo "== puertos del tunel =="
ss -tlnp | grep -E ':1080|:2222' || echo "NO ESCUCHAN"
echo "== banner del server de la oficina (via 2222) =="
timeout 8 bash -c 'echo | nc -w 5 127.0.0.1 2222' | head -1 || echo "sin respuesta en 2222"
echo "== egreso por SOCKS 1080 =="
curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo "SOCKS no responde"
echo
echo "== sshd config relevante =="
grep -riE "^AllowUsers|^PermitRootLogin|^PasswordAuthentication" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null | head -5
