#!/bin/bash
# Actualizar el hecho 'no_reportar_conversaciones_otros_usuarios' de Diego
# para ser más explícito sobre cuándo SÍ avisar (decisión, resultado) vs.
# cuándo NO (pasos intermedios).
set +e

DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ Hecho ANTES ═══"
sqlite3 -header -column "$DB" "
SELECT clave, valor, fuente, actualizado
FROM hechos
WHERE usuario_id = 1 AND clave = 'no_reportar_conversaciones_otros_usuarios'
"

echo ""
echo "═══ UPDATE ═══"
sqlite3 "$DB" <<'SQLEOF'
UPDATE hechos
SET valor = 'Diego prefiere que las gestiones con terceros se resuelvan directamente, sin reportarle el ida y vuelta. Cuando un tercero le escribe a Diego (vía Maria), contestá vos directo con el tercero. SOLO avisale a Diego cuando: (a) necesitás una decisión que no podés tomar (qué horario, lugar, precio, monto, si confirmar o no algo), o (b) la gestión terminó y hay un resultado concreto para informar. NO le avises de pasos intermedios tipo "me mandó el email", "confirmó la fecha", "encontré el WA del lugar", "me pasó X dato" — esos los procesás vos sin reportar.',
    fuente = 'WA Diego 2026-05-11 (refinado 2026-05-15)',
    actualizado = CURRENT_TIMESTAMP
WHERE usuario_id = 1 AND clave = 'no_reportar_conversaciones_otros_usuarios';
SELECT changes() AS filas_modificadas;
SQLEOF

echo ""
echo "═══ Hecho DESPUÉS ═══"
sqlite3 -header -column "$DB" "
SELECT clave, valor, fuente, actualizado
FROM hechos
WHERE usuario_id = 1 AND clave = 'no_reportar_conversaciones_otros_usuarios'
"
