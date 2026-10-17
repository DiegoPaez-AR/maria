#!/bin/bash
# Solo lectura: por qué falla el push del cron desde 06:39 del 17/10.
# El canal de vuelta (push) está roto → la salida se publica enmascarada en _dl.
OUT=/var/www/intensa.io/_dl/diag-2e133eb55968a67c.txt
[ -f "$OUT" ] && exit 0
{
echo "hora: $(date '+%F %T %Z')"
cd /root/secretaria
echo "── remote ──"; git remote -v
echo "── status ──"; git status -sb | head -5
echo "── commits locales sin pushear ──"; git log --oneline origin/main..HEAD | wc -l; git log --format='%h %ci %s' origin/main..HEAD | tail -3
echo "── push en seco ──"; timeout 60 git push --dry-run origin HEAD:main 2>&1 | tail -15
echo "── .cron.log ──"; for f in ops/.cron.log logs/ops/cron-master.log logs/ops/cron.log; do [ -f $f ] && { echo "[$f]"; grep -n -i -E "push|fatal|error|denied|reject|GH0|secret" $f | tail -25; }; done
echo "── disco ──"; df -h / | tail -1
echo "── wa_outbox desde 17/10 (sin texto) ──"
( set -a; . config/instances/maria-paez.conf; set +a; sqlite3 "$MARIA_DB" "select id, estado, intentos, substr(numero,1,6)||'…', creado, entregado from wa_outbox where creado>='2026-10-17';" )
} 2>&1 | sed -E 's/gh[pousr]_[A-Za-z0-9]+/gh*_***/g; s#https://[^@/ ]+@#https://***@#g' > "$OUT"
chmod 644 "$OUT"
