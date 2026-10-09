#!/bin/bash
cd /root/secretaria
cp /var/www/intensa.io/_dl/verif-291-5b36d334.png ops/instances/maria-paez/shots/verif-291.png
cp /var/www/intensa.io/_dl/$(ls -t /var/www/intensa.io/_dl/ | grep verif-275 | head -1) ops/instances/maria-paez/shots/verif-275.png 2>/dev/null
ls -la ops/instances/maria-paez/shots/
echo LISTO
