#!/bin/bash
# Diag: qué hace hoy Maria con imágenes/PDFs entrantes. Buscar casos recientes
# donde el LLM tuvo un attachment y ver si extrajo datos estructurados (acción
# tipo upsert_contacto/agregar_pendiente) o solo respondió en texto.
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

echo "═══ Mensajes entrantes con attachment (últimos 30 días) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, substr(de,1,30) AS de, substr(cuerpo,1,80) AS cuerpo,
       substr(metadata_json,1,80) AS meta
FROM eventos
WHERE direccion = 'entrante'
  AND timestamp >= datetime('now', '-30 days')
  AND (metadata_json LIKE '%attachment%' OR metadata_json LIKE '%esMedia%' OR cuerpo LIKE '%adjuntó%')
ORDER BY id DESC LIMIT 10
"

echo ""
echo "═══ Acciones que el LLM emitió justo después de cada attachment ═══"
sqlite3 -column "$MARIA_DB" "
SELECT id, timestamp, substr(cuerpo,1,180) AS cuerpo
FROM eventos
WHERE canal = 'sistema' AND direccion = 'interno'
  AND cuerpo LIKE '%acción ejecutada%'
  AND timestamp >= datetime('now', '-30 days')
ORDER BY id DESC LIMIT 30
"

echo ""
echo "═══ Razonamiento del LLM cuando procesó esos PDFs/imágenes (busco en metadata) ═══"
sqlite3 "$MARIA_DB" "
SELECT id, timestamp, substr(metadata_json,1,400) AS razonamiento
FROM eventos
WHERE canal='sistema' AND cuerpo LIKE '%claude_call%' AND metadata_json LIKE '%razonamiento%'
  AND timestamp >= datetime('now', '-3 days')
ORDER BY id DESC LIMIT 10
" 2>&1 | head -30
