#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Eventos sistema con timeout/Timeout en cuerpo (últimos 14 días) ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,250) AS msg FROM eventos WHERE timestamp >= datetime('now','-14 days') AND (cuerpo LIKE '%Timeout%claude%' OR cuerpo LIKE '%timeout%claude%' OR cuerpo LIKE '%180000ms%' OR cuerpo LIKE '%SIGKILL%') ORDER BY timestamp DESC LIMIT 20;"

echo ""
echo "═══ pm2 logs últimos 10000 — Timeout/180000ms/SIGKILL ═══"
pm2 logs maria-paez --lines 10000 --nostream 2>&1 | grep -iE "timeout.*claude|180000ms|SIGKILL|killed" | tail -30

echo ""
echo "═══ Tabla llamadas_claude (auditoría) - últimas 20 con error o ms>120000 ═══"
sqlite3 "$DB" ".schema llamadas_claude" 2>&1 | head -10
echo "---"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), usuario_id, ms, prompt_chars, raw_chars, substr(error_msg,1,80) AS err FROM llamadas_claude WHERE timestamp >= datetime('now','-14 days') AND (error_msg IS NOT NULL OR ms > 120000) ORDER BY ms DESC LIMIT 20;" 2>&1

echo ""
echo "═══ Histograma ms de claude (cuantiles aprox) ═══"
sqlite3 "$DB" "SELECT 'count:' || COUNT(*), 'min:' || MIN(ms), 'max:' || MAX(ms), 'avg:' || ROUND(AVG(ms)) FROM llamadas_claude WHERE timestamp >= datetime('now','-7 days');" 2>&1

echo ""
echo "═══ Top 10 más lentos últimos 7 días ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), ms, prompt_chars, raw_chars FROM llamadas_claude WHERE timestamp >= datetime('now','-7 days') ORDER BY ms DESC LIMIT 10;" 2>&1
