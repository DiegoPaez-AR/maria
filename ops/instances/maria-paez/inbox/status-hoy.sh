#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a
cd /root/secretaria

HOY_ART=$(TZ=America/Argentina/Buenos_Aires date +%Y-%m-%d)
HOY_UTC_DESDE=$(TZ=UTC date -d "$HOY_ART 00:00:00 America/Argentina/Buenos_Aires" +%Y-%m-%d' '%H:%M:%S)
echo "Hoy ART: $HOY_ART  | desde UTC: $HOY_UTC_DESDE"

echo ""
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys, time
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    up_ms = e.get('pm_uptime', 0)
    up_s = (time.time()*1000 - up_ms) / 1000
    h = int(up_s/3600); m = int((up_s%3600)/60)
    mem_mb = (p.get('monit',{}).get('memory') or 0) / 1024 / 1024
    print(f\"  pid={p.get('pid')} status={e.get('status')} restarts={e.get('restart_time')} uptime={h}h{m}m mem={mem_mb:.0f}MB\")
"

echo ""
echo "═══ Errores/fallos sistema HOY (ART) — excluyendo timeouts y los ya resueltos ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT timestamp, substr(cuerpo,1,200) AS cuerpo
FROM eventos
WHERE timestamp >= '$HOY_UTC_DESDE'
  AND canal='sistema'
  AND (cuerpo LIKE '%falló%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%FALLARON%' OR cuerpo LIKE '%crash%' OR cuerpo LIKE '%ENOENT%')
  AND cuerpo NOT LIKE '%invalid_grant%'
ORDER BY id DESC LIMIT 25
"

echo ""
echo "═══ Volumen hoy (ART) ═══"
sqlite3 "$MARIA_DB" <<EOF
SELECT 'WA recibidos:', COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp >= '$HOY_UTC_DESDE';
SELECT 'WA enviados:', COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp >= '$HOY_UTC_DESDE';
SELECT 'Gmail eventos:', COUNT(*) FROM eventos WHERE canal='gmail' AND timestamp >= '$HOY_UTC_DESDE';
SELECT 'Calendar eventos:', COUNT(*) FROM eventos WHERE canal='calendar' AND timestamp >= '$HOY_UTC_DESDE';
SELECT 'Llamadas Claude:', COUNT(*) FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%claude_call%' AND timestamp >= '$HOY_UTC_DESDE';
EOF

echo ""
echo "═══ Top 5 usuarios por actividad hoy ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT COALESCE(u.nombre,'(n/a)') AS usuario,
       SUM(CASE WHEN e.direccion='entrante' THEN 1 ELSE 0 END) AS recibidos,
       SUM(CASE WHEN e.direccion='saliente' THEN 1 ELSE 0 END) AS enviados
FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
WHERE e.canal='whatsapp' AND e.timestamp >= '$HOY_UTC_DESDE'
GROUP BY u.nombre ORDER BY (recibidos+enviados) DESC LIMIT 5
"

echo ""
echo "═══ Pendientes nuevos hoy ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, estado, substr(desc,1,80) AS descripcion
FROM pendientes WHERE creado >= '$HOY_UTC_DESDE' ORDER BY id
"

echo ""
echo "═══ ¿PDF/attachments fueron procesados OK hoy? ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT timestamp, substr(cuerpo,1,140) AS cuerpo
FROM eventos
WHERE timestamp >= '$HOY_UTC_DESDE'
  AND (cuerpo LIKE '%pdf%' OR cuerpo LIKE '%adjunt%' OR cuerpo LIKE '%attach%')
ORDER BY id DESC LIMIT 10
"
