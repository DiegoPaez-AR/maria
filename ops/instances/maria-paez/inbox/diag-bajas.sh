#!/bin/bash
set -u
IDB=/root/secretaria/state/maria-paez/db/maria.sqlite
CDB=$(grep -E '^CONTROL_DB=' /root/secretaria/.env-intensa-api | cut -d= -f2-)
CDB=${CDB:-/root/secretaria/state/control/control.sqlite}

echo "===== usuarios en instancia maria-paez (match por nombre) ====="
sqlite3 -header -column "$IDB" "
SELECT id, nombre, activo, rol, email, wa_cus
FROM usuarios
WHERE nombre LIKE '%Ward%' OR nombre LIKE '%Facundo%' OR nombre LIKE '%Bagnato%'
   OR nombre LIKE '%santiago%' OR nombre LIKE '%Santiago%' OR nombre LIKE '%Rub%n%'
ORDER BY nombre;"
echo
echo "===== TODOS los usuarios activos (para ver el panorama) ====="
sqlite3 -header -column "$IDB" "SELECT id, nombre, activo, rol FROM usuarios WHERE activo=1 ORDER BY nombre;"
echo
echo "===== clientes en control (match por nombre) ====="
sqlite3 -header -column "$CDB" "
SELECT id, nombre, estado, instancia_slug, instancia_usuario_id,
       stripe_subscription_id, lemon_subscription_id
FROM clientes
WHERE nombre LIKE '%Ward%' OR nombre LIKE '%Facundo%' OR nombre LIKE '%Bagnato%'
   OR nombre LIKE '%santiago%' OR nombre LIKE '%Santiago%' OR nombre LIKE '%Rub%n%'
ORDER BY nombre;"
echo
echo "===== clientes activos totales ====="
sqlite3 -header -column "$CDB" "SELECT id, nombre, estado, stripe_subscription_id, lemon_subscription_id FROM clientes ORDER BY id;"
