#!/bin/bash
# Re-deploy: agregar terminos + Turnstile keys + repaginas.
set +e
cd /root/secretaria

echo "═══ 1. Update .env-intensa-api con Turnstile keys ═══"
ENV=/root/secretaria/.env-intensa-api
if [ -f "$ENV" ]; then
  # Reemplazar las líneas TURNSTILE_*= con valores reales
  sed -i 's|^TURNSTILE_SITE_KEY=.*|TURNSTILE_SITE_KEY=0x4AAAAAADSjZdSiOLo4gIGt|' "$ENV"
  sed -i 's|^TURNSTILE_SECRET_KEY=.*|TURNSTILE_SECRET_KEY=0x4AAAAAADSjZXlXB7nFffvozg4teJUck4I|' "$ENV"
  echo "  ✓ Turnstile keys actualizadas en $ENV"
  grep -E "^TURNSTILE" "$ENV" | sed 's/=.*/=***SET***/'
else
  echo "  ⚠ $ENV no existe, creandolo"
  cat > "$ENV" <<EOFENV
INTENSA_API_PORT=4080
INTENSA_API_HOST=127.0.0.1
CONTROL_DB=/root/secretaria/state/control/control.sqlite
ARCHIVE_DB=/root/secretaria/state/control/archive.sqlite
INTENSA_LANDING_BASE=https://intensa.io/maria
LEMON_BUY_BASE=https://intensa.lemonsqueezy.com/checkout/buy/10c60c3c-40a0-4c6d-9259-0646be3777a4
LEMON_TEST_MODE=true
TURNSTILE_SITE_KEY=0x4AAAAAADSjZdSiOLo4gIGt
TURNSTILE_SECRET_KEY=0x4AAAAAADSjZXlXB7nFffvozg4teJUck4I
INSTANCES_BOOTSTRAP_FILE=/root/secretaria/config/instances.bootstrap.json
EOFENV
  chmod 600 "$ENV"
fi

echo
echo "═══ 2. Migración schema control.sqlite (ALTER TABLE para terminos) ═══"
# El schema.sql usa CREATE TABLE IF NOT EXISTS — no toca tablas existentes.
# Para columnas nuevas en tablas existentes hay que hacer ALTER manual.
sqlite3 /root/secretaria/state/control/control.sqlite <<SQL 2>&1
-- signup_pending: agregar terminos_aceptados_en si falta
SELECT '  signup_pending tiene terminos_aceptados_en: ' || CASE WHEN EXISTS (
  SELECT 1 FROM pragma_table_info('signup_pending') WHERE name='terminos_aceptados_en'
) THEN 'sí' ELSE 'no, agregando…' END;
SQL
# Idempotente — ignore errors si ya existe la columna
sqlite3 /root/secretaria/state/control/control.sqlite "ALTER TABLE signup_pending ADD COLUMN terminos_aceptados_en DATETIME" 2>&1 | grep -v "duplicate column" || true
sqlite3 /root/secretaria/state/control/control.sqlite "ALTER TABLE clientes ADD COLUMN terminos_aceptados_en DATETIME" 2>&1 | grep -v "duplicate column" || true
sqlite3 /root/secretaria/state/control/control.sqlite "ALTER TABLE clientes ADD COLUMN terminos_version TEXT" 2>&1 | grep -v "duplicate column" || true
echo "  ✓ columnas terminos_* aseguradas en control.sqlite"

echo
echo "═══ 3. Sincronizar /var/www con el repo (deploy.sh) ═══"
cd /root/secretaria/ops/sites/intensa.io
bash deploy.sh 2>&1 | tail -20

echo
echo "═══ 4. pm2 restart intensa-api para tomar las nuevas env vars ═══"
pm2 restart intensa-api --update-env 2>&1 | tail -5
sleep 3
pm2 list | grep intensa-api

echo
echo "═══ 5. Smoke tests ═══"
curl -sk -o /dev/null -w "/maria/terminos/  → %{http_code}\n" https://intensa.io/maria/terminos/
curl -sk -o /dev/null -w "/maria/signup/    → %{http_code}\n" https://intensa.io/maria/signup/
curl -sk -o /dev/null -w "/maria/cuenta/    → %{http_code}\n" https://intensa.io/maria/cuenta/
curl -sk -o /dev/null -w "/maria/api/health → %{http_code}\n" https://intensa.io/maria/api/health
echo
echo "  signup con checkbox términos:"
curl -sk https://intensa.io/maria/signup/ | grep -o 'name="acepto_terminos"' | head -1
echo
echo "  cuenta con turnstile sitekey real:"
curl -sk https://intensa.io/maria/cuenta/ | grep -o 'data-sitekey="0x4AAAAAA[^"]*"' | head -1
echo
echo "  validación backend (POST signup/start SIN acepto_terminos debería rechazar):"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"test","email":"test@test.com","wa":"5491111111111","calendar_provider":"google"}' \
  https://intensa.io/maria/api/signup/start | head -1

echo
echo "═══ DONE ═══"
