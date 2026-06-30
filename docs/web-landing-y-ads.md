# Capa web (landing intensa.io) + Google Ads

Documenta dónde viven las páginas públicas de intensa.io, cómo se publican,
y el tracking de Google Ads. Hasta ahora estaba sin documentar.

## Dónde viven las páginas

- **Fuente versionado:** `ops/sites/intensa.io/` en este repo.
  - `index.html` (home intensa.io)
  - `maria/index.html` (landing de María)
  - `maria/signup/index.html` (alta/suscripción)
  - `maria/cuenta/index.html` (portal de cliente passwordless)
  - `maria/terminos/index.html` (T&C)
  - `styles.css`, `script.js` por landing.
- **Servido en producción:** NGINX, vhost `/etc/nginx/sites-available/intensa.io.conf`,
  docroot `/var/www/intensa.io/`. SSL por certbot. El mismo NGINX sirve
  veritas-trace.com (no tocar).
- **Backend del signup:** `ops/backend/intensa-api/` (Express, pm2 `intensa-api`,
  127.0.0.1:4080). Valida email+WhatsApp con código, crea checkout de Stripe.

## Cómo se publica (deploy)

El fuente NO se auto-publica a `/var/www`. El cron solo hace `git reset --hard`
del working tree. Para publicar:

```
bash /root/secretaria/ops/sites/intensa.io/deploy.sh
```

`deploy.sh` es idempotente: copia a `/var/www/intensa.io/`, aplica cache-bust a
las refs de `styles.css`/`script.js`, fija permisos, valida y recarga nginx, y
hace smoke test. NO toca el vhost si ya tiene SSL (preserva los bloques de certbot).

Flujo desde Cowork: editar los `.html` en `ops/sites/...`, commit+push, y dropear
un inbox `ops/instances/maria-paez/inbox/<nombre>.sh` que corra `deploy.sh`.
El cron (≤60s) hace reset al working tree (trae el HTML nuevo) y ejecuta el inbox.

## Google Ads — conversion tracking

- **ID de Google Ads:** `AW-18285351437`.
- **Global site tag (gtag.js):** inyectado en el `<head>` de las 5 páginas de
  `intensa.io` (home + maria + signup + cuenta + terminos). Deployado 2026-06-30.
- **Conversión "Suscripción":** configurada en Google Ads para dispararse
  automáticamente cuando la URL contiene `signup/?status=ok` (no hay snippet de
  evento aparte; alcanza con el tag global).
- **Por qué funciona:** tras pagar, Stripe redirige al `success_url` que arma
  `ops/backend/intensa-api/routes/signup.js:110` →
  `${INTENSA_LANDING_BASE}/signup/?status=ok` = `https://intensa.io/maria/signup/?status=ok`.
  Esa navegación real (no es solo toggle JS) carga la página con el tag → dispara.
  - `INTENSA_LANDING_BASE=https://intensa.io/maria` (en `.env-intensa-api`).
  - `cancel_url` = `signup/?status=cancel` (no es conversión).

## Si hay que cambiar el ID o agregar un evento explícito

- Cambiar ID: reemplazar `AW-18285351437` en los 5 `.html` de `ops/sites/intensa.io/`
  y redeployar.
- Conversión más robusta (no depender del match de URL): agregar en
  `signup/script.js`, en el branch que detecta `status=ok`, un
  `gtag('event','conversion',{send_to:'AW-18285351437/<label>'})`.
