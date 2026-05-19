#!/bin/bash
# Capacity diagnostic — estado actual y tasas de crecimiento.
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ DB path & tamaño ═══"
ls -la "$DB" 2>&1
du -sh "$DB" 2>&1

echo
echo "═══ Conteo por tabla ═══"
sqlite3 "$DB" <<'SQL'
.mode column
.headers on
SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM usuarios
UNION ALL SELECT 'usuarios_activos', COUNT(*) FROM usuarios WHERE activo=1
UNION ALL SELECT 'eventos', COUNT(*) FROM eventos
UNION ALL SELECT 'pendientes_abiertos', COUNT(*) FROM pendientes WHERE estado='abierto'
UNION ALL SELECT 'pendientes_totales', COUNT(*) FROM pendientes
UNION ALL SELECT 'contactos', COUNT(*) FROM contactos
UNION ALL SELECT 'hechos', COUNT(*) FROM hechos
UNION ALL SELECT 'programados_pendientes', COUNT(*) FROM programados WHERE enviado=0
UNION ALL SELECT 'programados_total', COUNT(*) FROM programados;
SQL

echo
echo "═══ Tamaño por tabla (KB, estimado) ═══"
sqlite3 "$DB" <<'SQL'
.mode column
.headers on
SELECT name AS tabla,
       SUM(pgsize) / 1024 AS kb
FROM dbstat
GROUP BY name
ORDER BY kb DESC
LIMIT 10;
SQL

echo
echo "═══ Eventos por día (últimos 30 días) ═══"
sqlite3 -header -column "$DB" "
SELECT date(timestamp) AS dia, COUNT(*) AS eventos,
       SUM(CASE WHEN canal='whatsapp' THEN 1 ELSE 0 END) AS wa,
       SUM(CASE WHEN canal='gmail' THEN 1 ELSE 0 END) AS mail,
       SUM(CASE WHEN canal='sistema' THEN 1 ELSE 0 END) AS sys
FROM eventos
WHERE timestamp >= datetime('now','-30 days')
GROUP BY dia
ORDER BY dia DESC
LIMIT 30;
"

echo
echo "═══ Claude calls por día (últimos 14 días) ═══"
sqlite3 -header -column "$DB" "
SELECT date(timestamp) AS dia,
       COUNT(*) AS calls,
       SUM(CAST(substr(cuerpo, instr(cuerpo,': ')+2, instr(cuerpo,'ms')-instr(cuerpo,': ')-2) AS INTEGER)) AS total_ms
FROM eventos
WHERE canal='sistema' AND cuerpo LIKE 'claude_call%' AND timestamp >= datetime('now','-14 days')
GROUP BY dia
ORDER BY dia DESC;
"

echo
echo "═══ Contactos por usuario ═══"
sqlite3 -header -column "$DB" "
SELECT u.nombre, COUNT(c.id) AS contactos,
       SUM(CASE WHEN c.visibilidad='publica' THEN 1 ELSE 0 END) AS publicos,
       SUM(CASE WHEN c.visibilidad='privada' THEN 1 ELSE 0 END) AS privados
FROM usuarios u LEFT JOIN contactos c ON c.usuario_id=u.id
WHERE u.activo=1
GROUP BY u.id ORDER BY contactos DESC;
"

echo
echo "═══ VPS specs ═══"
echo "--- CPU ---"
grep -c ^processor /proc/cpuinfo
grep "model name" /proc/cpuinfo | head -1
echo "--- RAM ---"
free -h
echo "--- Disk ---"
df -h / /root 2>/dev/null | grep -v "tmpfs"

echo
echo "═══ pm2 status + memoria de maria-paez ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data:
    if 'maria' in p.get('name',''):
        m = p.get('monit', {})
        print(f\"  name={p['name']}  pid={p.get('pid')}  cpu={m.get('cpu')}%  mem={m.get('memory',0)//1024//1024}MB  restarts={p.get('pm2_env',{}).get('restart_time')}\")
" 2>/dev/null || pm2 list 2>/dev/null | head -15

echo
echo "═══ Tamaño wwebjs_auth (sesión WA) ═══"
du -sh /root/secretaria/state/maria-paez/.wwebjs_auth 2>/dev/null

echo
echo "═══ Listado de instancias activas ═══"
ls -la /root/secretaria/config/instances/ 2>/dev/null | grep -v "^d\|^total" | head -10

echo
echo "═══ DONE ═══"
