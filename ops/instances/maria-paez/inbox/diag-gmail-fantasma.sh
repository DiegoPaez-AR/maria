#!/bin/bash
# Diag: de donde sale maria.paez.secre@gmail.com + conversacion con Hernan (2682-9596).
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf

echo "=== .conf: vars de identidad/email (sin secretos) ==="
grep -nE "ASISTENTE_FROM_EMAIL|MARIA_FROM_EMAIL|ASISTENTE_NOMBRE|ASISTENTE_EMAIL|FROM_EMAIL" "$cf" 2>&1 || echo "no hay match en .conf"

echo ""
echo "=== env VIVO del proceso pm2 (lo que realmente usa el runtime) ==="
pm2 jlist 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const a=JSON.parse(s); const m=a.find(x=>x.name==="maria-paez");
  if(!m){console.log("no maria-paez");return;}
  const e=m.pm2_env||{};
  for(const k of ["ASISTENTE_FROM_EMAIL","MARIA_FROM_EMAIL","ASISTENTE_NOMBRE","ASISTENTE_EMAIL"])
    console.log(k+" = "+(e[k]===undefined?"(no seteado)":e[k]));
});'

echo ""
set -a; . "$cf"; set +a
DB="$MARIA_DB"
echo "=== quien es el contacto 2682-9596? (usuarios + contactos) ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,rol,wa_cus,email FROM usuarios WHERE wa_cus LIKE '%26829596%' OR nombre LIKE '%Fulco%' OR nombre LIKE '%Hern%';" 2>&1
echo "--- contactos ---"
sqlite3 -header -column "$DB" "SELECT id,usuario_id,nombre,whatsapp,COALESCE(email,'') FROM contactos WHERE whatsapp LIKE '%26829596%';" 2>&1

echo ""
echo "=== conversacion con 2682-9596 (hora ART) ==="
sqlite3 "$DB" "
SELECT datetime(timestamp,'-3 hours') art, direccion, COALESCE(nombre,'') q,
       COALESCE(json_extract(metadata_json,'\$.slot'),'') slot,
       replace(COALESCE(cuerpo,''),char(10),' / ') texto
FROM eventos
WHERE canal='whatsapp' AND de LIKE '%26829596%'
ORDER BY timestamp DESC LIMIT 25;
" 2>&1

echo ""
echo "=== hechos/estado que mencionen gmail o secre ==="
sqlite3 -header -column "$DB" "SELECT usuario_id,clave,substr(valor,1,80) FROM hechos WHERE valor LIKE '%gmail%' OR valor LIKE '%secre%' OR clave LIKE '%mail%';" 2>&1 | head -20
