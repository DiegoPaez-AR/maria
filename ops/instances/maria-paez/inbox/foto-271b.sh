#!/bin/bash
cd /root/secretaria
cp /var/www/intensa.io/_dl/verif-271-1f7beec4.png ops/instances/maria-paez/shots/verif-271b.png && echo copiada
grep -hE "\[MB v4\.[89]\].*\[upd\]" logs/maria-paez/out.log /root/secretaria/logs/sofia-bruscoli/out.log | tail -3 | cut -c1-140
echo LISTO
