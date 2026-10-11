#!/bin/bash
tail -2 /root/mariabridge-build.log | cut -c1-140; cat /var/www/intensa.io/_dl/mariabridge-latest.json; echo
grep -h "diego\|Diego" /dev/null; echo LISTO
