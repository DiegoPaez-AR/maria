#!/bin/bash
ss -tlnp | grep 1080 || echo "(nadie escucha en 1080)"
grep -iE "accepted publickey" /var/log/auth.log | tail -2
grep -iE "WA túnel|WA ready" /root/.pm2/logs/maria-paez-out.log | tail -3
