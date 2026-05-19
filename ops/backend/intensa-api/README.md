# intensa-api

Servicio de control (signup, checkout, webhook LS, portal del cliente) para
todas las instancias de María. Vive en pm2 como app `intensa-api`,
escucha en `127.0.0.1:4080`, NGINX lo proxa desde `/maria/api/*`.

## Deploy inicial

1. **Configurar instancias**: copiar `bootstrap/instances.bootstrap.example.json` a
   `/root/secretaria/config/instances.bootstrap.json` y editar:
   - `internal_secret`: generar con `openssl rand -hex 32`. Anotar también en el
     `.conf` de cada instancia como `ASISTENTE_INTERNAL_SECRET=...`.
   - `internal_port`: puerto donde el `internal-api` de esa Maria escucha
     localmente (default propuesto: 4501 para maria-paez, 4502 para la próxima, etc.).
     Anotar en el `.conf` como `ASISTENTE_INTERNAL_PORT=...`.

2. **Crear `.env-intensa-api`**: copiar las creds reales (LS API key, Webhook
   Secret, Buy Base URL, Turnstile keys) a `/root/secretaria/.env-intensa-api`
   (gitignored). Permisos 600. Ver `.env.example` para la lista.

3. **Instalar deps**: `cd /root/secretaria/ops/backend/intensa-api && npm install`.

4. **Reload pm2**: `pm2 reload ecosystem.config.js` (el ecosystem ya incluye
   `intensa-api` en el array — se levanta automáticamente).

5. **Verificar**: `curl http://127.0.0.1:4080/health` debería responder
   `{"ok":true,...}`. Y `curl https://intensa.io/maria/api/health` el mismo
   resultado vía NGINX.

## Operación normal

- Logs: `pm2 logs intensa-api`
- DB: `/root/secretaria/state/control/control.sqlite`
- Archive: `/root/secretaria/state/control/archive.sqlite`

## Cron de borrado +90 días

Configurado en `ops/scripts/borrar-cancelled.sh`, corre 04:00 ART todos los días
y archiva+borra clientes cancelled hace más de 90 días.

## Rotación de credenciales

- LS API key: regenerar en dashboard LS → Settings → API → revoke + new. Actualizar
  `LEMON_API_KEY` en `.env-intensa-api` y `pm2 restart intensa-api`.
- Webhook secret: ídem.
- INTENSA_API_SECRET: regenerar con `openssl rand -hex 32`. **NO** invalida sesiones
  del portal (las cookies son tokens random independientes). Sí invalida los
  signup_tokens en curso (clientes que pagaron entre el cambio y la próxima sesión
  pueden necesitar resolución manual). Mejor cambiar fuera de hora pico.
