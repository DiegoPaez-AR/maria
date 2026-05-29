#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
DB="$MARIA_DB"
echo "=== conv Hernan (user 2) ultimas 30, hora ART ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, direccion, COALESCE(json_extract(metadata_json,'\$.slot'),json_extract(metadata_json,'\$.tipo'),'') m, replace(substr(COALESCE(cuerpo,''),1,200),char(10),' / ') t FROM eventos WHERE usuario_id=2 AND canal='whatsapp' AND timestamp >= '2026-05-29 14:30:00' ORDER BY timestamp;"
echo ""
echo "=== eventos sistema/interno de user 2 recientes (set_calendar_acceso, claude_call, errores) ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, replace(substr(COALESCE(cuerpo,''),1,140),char(10),' / ') t FROM eventos WHERE usuario_id=2 AND canal='sistema' AND timestamp >= '2026-05-29 15:00:00' ORDER BY timestamp;"
echo ""
echo "=== pm2 logs: lineas con Hernan / set_calendar / share / error (ultimas 40) ==="
tail -200 /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "hernan|26829596|137456250806423|set_calendar|share|acceso|error|loop" | tail -25
echo ""
echo "=== estado calendar Hernan AHORA ==="
sqlite3 -header -column "$DB" "SELECT id,calendar_id,calendar_acceso FROM usuarios WHERE id=2;"
