# Provisioning de una Maria white-label

Alta completa de una instancia nueva. Lo automatizable lo hace
`nueva-instancia.sh`; lo manual está acá.

## TL;DR

```bash
cd /root/secretaria
bash ops/provision/nueva-instancia.sh maria-acme "Maria Acme" maria.acme@gmail.com --dry-run  # ver qué haría
bash ops/provision/nueva-instancia.sh maria-acme "Maria Acme" maria.acme@gmail.com            # alta real
# ... pasos manuales del checklist que imprime ...
pm2 reload ecosystem.config.js --update-env
```

## Qué automatiza el script

| Paso | Qué | Detalle |
|---|---|---|
| 1 | `config/instances/<slug>.conf` | desde el template; genera WA_HOOK_SECRET, MARIA_VAULT_KEY y ASISTENTE_INTERNAL_SECRET propios; puerto = max+1 |
| 2 | `state/<slug>/db/` + credentials.json | credenciales de la MISMA app OAuth de Google (copiadas de una instancia existente) |
| 3 | nginx | `location /hooks/wa-<slug>/ → 127.0.0.1:<port>/wa-hook/` + `nginx -t` + reload (con backup y rollback) |
| 4 | control DB intensa-api | INSERT en `instances` con `signup_bot=0` (dedicada: NO recibe signups del round-robin) |
| 5 | pm2 (`--start`) | reload del ecosystem — correr DESPUÉS del OAuth |

## Pasos manuales (en orden)

1. **Cuenta Gmail de la Maria nueva** — del Workspace del cliente o Gmail
   dedicado. OJO Workspace ajeno: el admin debe trustear la app OAuth
   (Security → API controls) o Google revoca el refresh token en minutos.
2. **OAuth Google** — generar `state/<slug>/token.json` con el flow de
   siempre (docs/onboarding). La app OAuth es compartida ("In production",
   tokens sin TTL).
3. **Teléfono dedicado** — chip nuevo + WhatsApp registrado con ese número.
   **WARM-UP OBLIGATORIO**: 2-3 días de uso humano real (mensajes a mano,
   grupos, fotos) ANTES de conectar MariaBridge. Lección de los 3 bloqueos
   de Meta de julio.
4. **MariaBridge** — bajar el último APK (`https://intensa.io/_dl/` según
   `mariabridge-latest.json`), configurar URL + secret que imprime el
   script, dar los 3 permisos. La app es multitenant: mismo APK para todas.
5. **Telegram** (recomendado) — bot propio en @BotFather → token/username
   al `.conf` de LA instancia (nunca a `secrets.conf` global, que pisa a
   todas).
6. **Cliente como usuario** — desde el chat del owner: "sumá a <nombre>
   (<tel>) como usuario". El owner (Diego) queda solo-admin
   (`OWNER_SERVIDO=0`): recibe escalados, no briefs.
7. **Smoke test** — el curl `isTestMessage` del checklist + mandar un WA
   real al número y ver la respuesta.

## Gotchas conocidos (de la operación real)

- `secrets.conf` GANA sobre los `.conf` → todo secreto per-instance
  (WA_HOOK_SECRET, ASISTENTE_INTERNAL_SECRET, TELEGRAM_*) va en el `.conf`
  de la instancia. El script lo chequea y frena si hay conflicto.
- `pm2 reload ecosystem.config.js --update-env` es la ÚNICA forma de
  inyectar env nueva (pm2 restart a mano deja env legacy).
- El cron (`ops/cron-master.sh`) levanta TODOS los `.conf` de
  `config/instances/` automáticamente — inbox/outbox por instancia en
  `ops/instances/<slug>/`.
- Backups: el semanal cifrado ya incluye `state/` completo — nada que hacer.
- Facturación white-label: el subscription system (intensa-api) hoy asigna
  por round-robin las instancias `signup_bot=1`. La white-label va aparte
  (factura directa al cliente) hasta que se decida integrarla. ⚠️ Stripe
  rechazado 8/2026 — ver pendiente Mercado Pago.
