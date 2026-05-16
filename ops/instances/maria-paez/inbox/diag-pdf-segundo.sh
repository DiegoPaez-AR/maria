#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a
cd /root/secretaria

echo "═══ Logs pm2 después del reload de las 20:14 (con el fix nuevo) ═══"
pm2 logs maria-paez --lines 500 --nostream 2>&1 | awk '/20:14:0[2-9]/,0' | tail -80

echo ""
echo "═══ Archivos /tmp/maria-attach-* actuales ═══"
ls -la /tmp/maria-attach-* 2>&1 | tail -10

echo ""
echo "═══ Eventos PDF/attach/brochure desde 20:14 ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, direccion, substr(de,1,30) AS de, substr(COALESCE(cuerpo,''),1,160) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-16 23:14'
ORDER BY id DESC LIMIT 30
"

echo ""
echo "═══ Errores recientes en claude-client (post-fix) ═══"
pm2 logs maria-paez --lines 500 --nostream 2>&1 | grep -E 'claude-client|attach|pdf' | tail -30
