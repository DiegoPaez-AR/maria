#!/bin/bash
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
upd(){ sqlite3 "$DB" "UPDATE contactos SET perfil_web='$2', actualizado=CURRENT_TIMESTAMP WHERE id=$1;"; }

# --- Confirmados por búsqueda web (rol/empresa) ---
upd 210 'CFO en Vrainz Accelerator (aceleradora; contenidos para telcos, Bs As)'
upd 167 'Director en Qubit Corporate (ex Enpiric / Qubit TV)'
upd 275 'Ejecutivo en The Quantum Alliance (+25 anios liderando organizaciones)'

# --- Rehacer (5 con basura) ---
upd 144 'Senior Engagement Manager en Ericsson (Argentina)'
upd 97  'Ejecutivo en The Quantum Alliance (+25 anios liderando organizaciones)'
upd 73  'Presidente en Sondeos'
upd 173 'Directora en Sens Medical'
upd 197 'Gerente de Desarrollo de Negocios y Ventas en YPF Luz'

# --- Contexto de empresa (dominio corporativo; rol no confirmado) ---
upd 166 'Telefonica'
upd 309 'Southern Silica (arena silicea para industria/vidrio, Bs As)'
upd 206 'Mills Capital Group (asesoria financiera / wealth management, Bs As)'
upd 184 'mViajes (agencia de viajes)'
upd 227 'Froneus (IA conversacional / voicebots)'
upd 92  'The Quantum Alliance'
upd 211 'Sondeos'
upd 141 'Sens Medical'
upd 102 'Lumina Consultora'
upd 168 'Telefonica'
upd 128 'BabelQ'
upd 90  'Capurro'
upd 176 'Telefonica'
upd 326 'Sondeos'
upd 104 'IPLAN (telco / datacenter, Argentina)'
upd 314 'Indesam Delta Group'
upd 177 'Sondeos'
upd 292 'Froneus (IA conversacional / voicebots)'
upd 86  'Froneus (IA conversacional / voicebots)'
upd 169 'Sondeos'
upd 108 'Sondeos'
upd 46  'eBuono'
upd 58  'Capurro'
upd 234 'Froneus (IA conversacional / voicebots)'
upd 79  'Sondeos'
upd 308 'Naviera del Parana'

echo "=== Resultado ==="
echo "perfil_web NOT NULL (total): $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE perfil_web IS NOT NULL;")"
echo "con email sin perfil aun:     $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE email IS NOT NULL AND email!='' AND perfil_web IS NULL;")"
echo "--- los recien actualizados ---"
sqlite3 "$DB" "SELECT id||' | '||nombre||' -> '||perfil_web FROM contactos WHERE id IN (210,167,275,144,97,73,173,197,166,309,206,184,227,92,211,141,102,168,128,90,176,326,104,314,177,292,86,169,108,46,58,234,79,308) ORDER BY id;"
