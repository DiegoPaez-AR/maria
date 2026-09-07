#!/bin/bash
for i in $(seq 1 50); do pgrep -f mb-build-worker >/dev/null || break; sleep 10; done
echo "build worker corriendo: $(pgrep -f mb-build-worker >/dev/null && echo si || echo no)"
tail -15 /root/mariabridge-build.log
echo "--- latest.json"; cat /var/www/intensa.io/_dl/mariabridge-latest.json
