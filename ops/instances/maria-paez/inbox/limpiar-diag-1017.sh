#!/bin/bash
# Borra los diag-*.txt que publiqué en _dl mientras el push estaba roto (17/10)
rm -fv /var/www/intensa.io/_dl/diag-2e133eb55968a67c.txt /var/www/intensa.io/_dl/diag-d542f22af36801a3.txt /var/www/intensa.io/_dl/diag-9df65c3abf373fc6.txt
ls /var/www/intensa.io/_dl/ | grep -c '^diag-' || true
