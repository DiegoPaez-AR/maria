#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a
cd /root/secretaria

echo "═══ Eventos con 'Brochure' / 'Global AI' / 'brochure' (hoy y ayer) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, direccion, substr(COALESCE(de,''),1,40) AS de,
       substr(COALESCE(cuerpo,''),1,160) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-15'
  AND (cuerpo LIKE '%rochure%' OR cuerpo LIKE '%Global AI%' OR cuerpo LIKE '%global_ai%' OR cuerpo LIKE '%.pdf%' OR cuerpo LIKE '%(adjuntó%' OR metadata_json LIKE '%.pdf%' OR metadata_json LIKE '%attachment%')
ORDER BY id DESC LIMIT 30
"

echo ""
echo "═══ Errores recientes con PDF / attach / Read / archivo (hoy) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, substr(cuerpo,1,220) AS cuerpo
FROM eventos
WHERE timestamp >= '2026-05-16'
  AND (cuerpo LIKE '%pdf%' OR cuerpo LIKE '%attach%' OR cuerpo LIKE '%attachment%' OR cuerpo LIKE '%adjunt%' OR cuerpo LIKE '%File not%')
ORDER BY id DESC LIMIT 20
"

echo ""
echo "═══ /tmp/ — attachments de Maria recientes ═══"
ls -la /tmp/maria-attach-* 2>&1 | tail -20

echo ""
echo "═══ Últimos logs pm2 con error / pdf / attach / claude (últimos 200) ═══"
pm2 logs maria-paez --lines 500 --nostream 2>&1 | grep -iE 'pdf|attach|brochure|Global AI|adjunt|read.*fail|@/tmp/maria-attach' | tail -30
