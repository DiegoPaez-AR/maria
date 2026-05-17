#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

# UTC ahora — 17-may. Restamos 3h para "00:00 ART"
DESDE='2026-05-17 03:00:00'   # = 00:00 ART del 17-may
DESDE_AYER_TARDE='2026-05-16 23:20:00'  # post último reload

echo "═══ Volumen REAL desde 17-may 00:00 ART ═══"
sqlite3 "$MARIA_DB" <<EOF
SELECT 'WA recibidos:', COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp >= '$DESDE';
SELECT 'WA enviados:', COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp >= '$DESDE';
SELECT 'Gmail:', COUNT(*) FROM eventos WHERE canal='gmail' AND timestamp >= '$DESDE';
SELECT 'Calendar:', COUNT(*) FROM eventos WHERE canal='calendar' AND timestamp >= '$DESDE';
SELECT 'Claude calls:', COUNT(*) FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%claude_call%' AND timestamp >= '$DESDE';
EOF

echo ""
echo "═══ ¿Timeouts/errores Claude post último reload (16-may 23:14)? ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT timestamp, substr(cuerpo,1,180) AS cuerpo
FROM eventos
WHERE timestamp >= '$DESDE_AYER_TARDE'
  AND canal='sistema'
  AND (cuerpo LIKE '%Timeout%' OR cuerpo LIKE '%ERROR=%' OR cuerpo LIKE '%claude exit null%')
ORDER BY id DESC LIMIT 15
"

echo ""
echo "═══ Último intento de PDF (Diego 23:27 ART de ayer) — ¿se procesó OK? ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, direccion, substr(COALESCE(cuerpo,''),1,200) AS cuerpo
FROM eventos
WHERE id >= (SELECT id FROM eventos WHERE cuerpo LIKE 'proba ahora%' ORDER BY id DESC LIMIT 1)
ORDER BY id ASC LIMIT 10
"
