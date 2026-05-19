#!/bin/bash
# Deploy del subscription system completo:
#  - intensa-api (Node + Express, pm2)
#  - internal-api en maria-paez (puerto local)
#  - migración schema usuarios.* en maria-paez
#  - landing /signup/ y /cuenta/
#  - NGINX route /maria/api/* → 127.0.0.1:4080
#  - cron de borrado +90 días

set +e
cd /root/secretaria

echo "═══ 1. Crear state/control/ ═══"
mkdir -p state/control
echo "  ✓ /root/secretaria/state/control/"

echo
echo "═══ 2. Generar internal_secret + actualizar .conf de maria-paez ═══"
INTERNAL_SECRET="$(openssl rand -hex 32)"
CONF=/root/secretaria/config/instances/maria-paez.conf
if ! grep -q "ASISTENTE_INTERNAL_PORT" "$CONF"; then
  echo "" >> "$CONF"
  echo "# Internal HTTP API (consumed by intensa-api)" >> "$CONF"
  echo "ASISTENTE_INTERNAL_PORT=4501" >> "$CONF"
  echo "ASISTENTE_INTERNAL_SECRET=$INTERNAL_SECRET" >> "$CONF"
  echo "  agregado ASISTENTE_INTERNAL_PORT=4501 y secret"
else
  echo "  ya tenía ASISTENTE_INTERNAL_PORT — extrayendo secret existente"
  INTERNAL_SECRET=$(grep '^ASISTENTE_INTERNAL_SECRET=' "$CONF" | cut -d= -f2- | tr -d '"')
fi

echo
echo "═══ 3. Crear instances.bootstrap.json ═══"
cat > /root/secretaria/config/instances.bootstrap.json <<JSON
[
  {
    "slug": "maria-paez",
    "nombre": "Maria Paez",
    "host": "127.0.0.1",
    "internal_port": 4501,
    "internal_secret": "$INTERNAL_SECRET",
    "max_usuarios": 25,
    "signup_bot": 1
  }
]
JSON
chmod 600 /root/secretaria/config/instances.bootstrap.json
echo "  ✓ instances.bootstrap.json"

echo
echo "═══ 4. Crear .env-intensa-api ═══"
# Si ya existe, NO sobreescribirlo (puede tener keys que Diego ya rotó)
if [ -f /root/secretaria/.env-intensa-api ]; then
  echo "  ya existe — NO sobreescribiendo"
else
  # NOTA: las credenciales LS quedan en este commit en git history una vez.
  # Después del primer deploy exitoso, ROTARLAS en LS y borrar este script del repo.
  cat > /root/secretaria/.env-intensa-api <<'ENVEOF'
INTENSA_API_PORT=4080
INTENSA_API_HOST=127.0.0.1
CONTROL_DB=/root/secretaria/state/control/control.sqlite
ARCHIVE_DB=/root/secretaria/state/control/archive.sqlite
INTENSA_API_SECRET=65a737dbc37dead8bb114a7db0fa025253148d4017f4ea78628dab4a36901a89
INTENSA_LANDING_BASE=https://intensa.io/maria
LEMON_API_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI5NGQ1OWNlZi1kYmI4LTRlYTUtYjE3OC1kMjU0MGZjZDY5MTkiLCJqdGkiOiI5YTU2ZjY4Mjg2MTYwODFjNDRlZGJiNDQyODZhODg0MjgyMjFkYTYwMWRjMmJmMWFlMWJmYmRkYmM1MGFhMTEwZDY5NTllODc5NDQ1YWE5NCIsImlhdCI6MTc3OTIwODUzOS4zODMwNywibmJmIjoxNzc5MjA4NTM5LjM4MzA3MywiZXhwIjoxNzk1MDQ2NDAwLjAyMDgzNSwic3ViIjoiNzEyODQ1MyIsInNjb3BlcyI6W119.HnWpBEX220mLHgvHs7HIHn2DVx7RtfNKpHYXzJDlr8IS6xLBGRJwypb-pTnYPTFP4C6tS2jzyJgfwqNQnT1Bfk5Ac_NE8FqZwkb2gZlfH0XGqwdR7cZtxyabuSPI8HK8_rBGxSqhUid9kLQIsfMVeOqCakxSX-rw3_5JjIePorAEFduVDVCePOxpD61kmaZNYESB7jq0DUlSpofoHZ5_ddqSVwjz1O5oovLNPOhgvPEF7Q_VwdW5q6H6wC-1CA1sRsFyx6tkIUqjIpbUYT73vkKhhC04cAahX7VKZvWdU1WEv_qN9qxfud7J1V6A8czf91Jyhf8ZBqxCNau6C8wZiQI15AbEv48eMOY6a9UIKATvTI30dFxhka4v36OX4E3GFUnuqmchc8Hu9bXak6zUYmfAPeL5AvOwWe_qeIJgVfo0YJmQGf7wK-OgDx92PL-RzoHgEp05jBMB2iJgV84sj6Ulemk5YWRxJzEYlAj5cXRhMo-WXi78wwBE-ZLU7jALoVYXpOSXSi-B4ZWeQ3yAuwV0NmYPBGdqUn4NO_wLl1Z18G20zyIpkZkqNDWVh7ZeWLE4O0DElxK-9RwADdYPFlms__3nsLm2O4k7e3TDCRsMJEUL2lqyfz2qVqDZgpRH4loA57vJCAsShPgMRsYeQMvO0Xb3QE9eIPLnwjlpc1s
LEMON_WEBHOOK_SECRET=sfvASFbsfbf55$553-g
LEMON_BUY_BASE=https://intensa.lemonsqueezy.com/checkout/buy/10c60c3c-40a0-4c6d-9259-0646be3777a4
LEMON_TEST_MODE=true
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
INSTANCES_BOOTSTRAP_FILE=/root/secretaria/config/instances.bootstrap.json
ENVEOF
  chmod 600 /root/secretaria/.env-intensa-api
  echo "  ✓ .env-intensa-api creado con credenciales LS test mode"
  echo "  ⚠ ROTAR estas credenciales en LS después del primer deploy validado y borrar este script del repo."
fi

echo
echo "═══ 5. npm install del intensa-api ═══"
cd /root/secretaria/ops/backend/intensa-api
npm install --silent 2>&1 | tail -10
cd /root/secretaria
echo "  ✓ deps instaladas"

echo
echo "═══ 6. Update NGINX vhost — agregar location /maria/api/ ═══"
VHOST=/etc/nginx/sites-available/intensa.io.conf
if grep -q "location /maria/api/" "$VHOST"; then
  echo "  ya configurado, skip"
else
  cp -v "$VHOST" "${VHOST}.bak-$(date +%Y%m%d-%H%M%S)"
  python3 <<'PYEOF'
path = "/etc/nginx/sites-available/intensa.io.conf"
with open(path) as f: src = f.read()
inject = """    location /maria/api/ {
        proxy_pass http://127.0.0.1:4080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

"""
# Inyectar antes del location / { try_files... }
marker = "    location / {"
assert marker in src
i = src.index(marker)
src = src[:i] + inject + src[i:]
with open(path, "w") as f: f.write(src)
print("  vhost actualizado con /maria/api/")
PYEOF
fi
nginx -t 2>&1 | tail -3
systemctl reload nginx
echo "  ✓ nginx reload"

echo
echo "═══ 7. Smoke test del internal-api ANTES de reload ═══"
echo "  (la migración de maria-paez se aplica al pm2 reload, así que verificamos post-reload)"

echo
echo "═══ 8. pm2 reload — restartea maria-paez Y arranca intensa-api ═══"
pm2 reload ecosystem.config.js --update-env 2>&1 | tail -8
sleep 5

echo
echo "═══ 9. pm2 status ═══"
pm2 list

echo
echo "═══ 10. Smoke tests ═══"
echo "  intensa-api health (local):"
curl -s -o /dev/null -w "    127.0.0.1:4080/health → %{http_code}\n" http://127.0.0.1:4080/health
echo "  intensa-api health (vía nginx):"
curl -sk -o /dev/null -w "    https://intensa.io/maria/api/health → %{http_code}\n" https://intensa.io/maria/api/health
echo "  signup page:"
curl -sk -o /dev/null -w "    https://intensa.io/maria/signup/ → %{http_code}\n" https://intensa.io/maria/signup/
echo "  cuenta page:"
curl -sk -o /dev/null -w "    https://intensa.io/maria/cuenta/ → %{http_code}\n" https://intensa.io/maria/cuenta/
echo "  maria-paez internal-api (local):"
curl -s -H "X-Intensa-Secret: $INTERNAL_SECRET" -o /dev/null -w "    127.0.0.1:4501/health → %{http_code}\n" http://127.0.0.1:4501/health

echo
echo "═══ 11. Crontab para borrar-cancelled.sh ═══"
if crontab -l 2>/dev/null | grep -q borrar-cancelled.sh; then
  echo "  cron ya instalado"
else
  (crontab -l 2>/dev/null; echo '0 4 * * * /root/secretaria/ops/scripts/borrar-cancelled.sh >> /root/secretaria/ops/.borrar-cancelled.log 2>&1') | crontab -
  chmod +x /root/secretaria/ops/scripts/borrar-cancelled.sh
  echo "  ✓ cron 04:00 diario instalado"
fi

echo
echo "═══ 12. Status del .env-intensa-api ═══"
if grep -q "PENDIENTE_DIEGO" /root/secretaria/.env-intensa-api; then
  echo "  ⚠ FALTA: editar /root/secretaria/.env-intensa-api con las keys reales de LemonSqueezy"
  echo "  ⚠ Hasta entonces, el webhook va a rechazar requests."
fi

echo
echo "═══ DONE ═══"
