#!/bin/bash
cd /root/secretaria
mkdir -p ops/instances/maria-paez/shots
cp /var/www/intensa.io/_dl/verif-271-147bd361.png ops/instances/maria-paez/shots/verif-271.png && ls -la ops/instances/maria-paez/shots/
ls -t /var/www/intensa.io/_dl/verif-*.png | head -5
echo LISTO
