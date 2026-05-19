#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ 1. Esquema y registros de Teubal en tabla contactos ═══"
sqlite3 "$DB" "PRAGMA table_info(contactos);"
echo "---"
sqlite3 -header -column "$DB" "SELECT * FROM contactos WHERE nombre LIKE '%Teubal%' OR wa LIKE '%4491280%' OR wa LIKE '%43092046%' ORDER BY id;"

echo ""
echo "═══ 2. Es usuario activo? ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, wa_cus, wa_lid, calendar_acceso FROM usuarios WHERE nombre LIKE '%Teubal%' OR wa_cus LIKE '%4491280%' OR wa_cus LIKE '%43092046%';"

echo ""
echo "═══ 3. Trail completo de eventos relacionados con Teubal hoy ═══"
sqlite3 "$DB" <<'SQL'
.mode list
.headers off
.separator ' '
SELECT id, timestamp, canal, direccion, COALESCE(de,'-'), substr(COALESCE(cuerpo,''), 1, 280)
FROM eventos
WHERE timestamp >= '2026-05-19 03:00:00'
  AND (cuerpo LIKE '%Teubal%' OR cuerpo LIKE '%4491280%' OR cuerpo LIKE '%43092046%' OR de LIKE '%4491280%' OR de LIKE '%43092046%')
ORDER BY id ASC;
SQL

echo ""
echo "═══ 4. Programados pendientes para Teubal ═══"
sqlite3 -header -column "$DB" "SELECT id, cuando, canal, destino, substr(texto,1,80) AS texto, COALESCE(razon,'') FROM programados WHERE (destino LIKE '%4491280%' OR destino LIKE '%43092046%' OR razon LIKE '%Teubal%' OR texto LIKE '%Teubal%') ORDER BY id DESC LIMIT 20;"

echo ""
echo "═══ 5. wa-validate.js — ver el helper que está rechazando ═══"
head -80 /root/secretaria/wa-validate.js 2>/dev/null || find /root/secretaria -name "wa-validate*" -not -path "*/node_modules/*" -not -path "*/ops/*" 2>/dev/null
echo ""

echo "═══ 6. Probar getNumberId contra WhatsApp para ambos números ═══"
node <<'JS'
(async () => {
  try {
    const wa = require('/root/secretaria/wa');  // o como se llame
    console.log('wa exports:', Object.keys(wa));
  } catch (e) {
    console.log('require wa falló:', e.message);
  }

  // Buscar handler whatsapp con cliente disponible
  try {
    const path = require('path');
    const fs = require('fs');
    const cands = fs.readdirSync('/root/secretaria')
      .filter(f => /whatsapp|wa-?validate|wa-?handler/i.test(f));
    console.log('archivos candidatos:', cands);
  } catch (e) {}
})();
JS
