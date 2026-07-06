#!/bin/bash
pm2 restart maria-paez --update-env >/dev/null 2>&1
sleep 50
grep -iE "WA túnel|WA ready|qr" /root/.pm2/logs/maria-paez-out.log | tail -4
