# CalDAV providers — guía de configuración

Maria soporta CalDAV (RFC 4791) para usuarios que **no usan Google Calendar ni Microsoft Outlook**. Permite operar calendarios de iCloud, Yahoo, Fastmail, Nextcloud, Sabre/dav y cualquier server CalDAV-compliant.

## Cuándo elegir CalDAV

| Provider del usuario | calendar_provider |
|---|---|
| Google (Gmail, Workspace) | `google` |
| Microsoft (Outlook, M365) | `microsoft` (Fase 2, en desarrollo) |
| iCloud, Yahoo, Fastmail, Nextcloud, otros | `caldav` |

## Servers conocidos

### iCloud
- **URL**: `https://caldav.icloud.com/`
- **Username**: el Apple ID (típicamente un email).
- **Password**: NO el password de la cuenta. Se necesita un **app-specific password**:
  1. Ingresar a [appleid.apple.com](https://appleid.apple.com/) → Sign-in and Security → App-Specific Passwords.
  2. Generar uno nuevo con etiqueta "Maria Secretaria".
  3. Anotar el password formato `xxxx-xxxx-xxxx-xxxx`.
- **Nota**: iCloud requiere 2FA activada en la cuenta antes de poder generar app passwords.

### Yahoo
- **URL**: `https://caldav.calendar.yahoo.com/`
- **Username**: el Yahoo ID (típicamente `usuario@yahoo.com`).
- **Password**: app password generada en [Account Info → Account Security → Generate app password](https://login.yahoo.com/account/security).
- **Nota**: Verificar que Yahoo Calendar siga ofreciendo CalDAV en la cuenta del usuario — en algunas regiones lo discontinuaron.

### Fastmail
- **URL**: `https://caldav.fastmail.com/dav/`
- **Username**: el email completo.
- **Password**: app password generada en Settings → Password & Security → App Passwords. Permite scopearla solo a calendarios.

### Nextcloud / Sabre/dav (self-hosted)
- **URL**: típicamente `https://tu-nextcloud.dominio/remote.php/dav/` o el endpoint que documente el operador del server.
- **Username/Password**: las credenciales de la cuenta o un token específico de calendarios si el server lo soporta.

## Shape de `calendar_auth_json`

Cifrado en DB con vault (`MARIA_VAULT_KEY`):

```json
{
  "server_url":   "https://caldav.icloud.com/",
  "username":     "user@icloud.com",
  "password":     "xxxx-xxxx-xxxx-xxxx",
  "calendar_url": "https://caldav.icloud.com/123456789/calendars/home/",
  "calendar_id":  null
}
```

- `server_url` (required): base de discovery.
- `username` (required): usuario completo.
- `password` (required): app-specific password.
- `calendar_url` (opcional): cacheado tras la primera discovery — acelera siguientes llamadas. Si está vacío, el provider lo descubre al primer uso.
- `calendar_id` (opcional): si el user tiene múltiples calendarios y quiere usar uno específico (no el primero descubierto). Puede ser la URL o el `displayName`.

## Setup actual (manual)

Hasta que Fase 4 (onboarding UX) esté lista, configurar un user CalDAV se hace por DB:

```bash
# En el VPS, con MARIA_VAULT_KEY en el env:
node -e "
const vault = require('/root/secretaria/vault');
const creds = {
  server_url: 'https://caldav.icloud.com/',
  username:   'user@icloud.com',
  password:   'xxxx-xxxx-xxxx-xxxx',
};
console.log(vault.cifrar(creds));
"
# → blob base64

sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite <<'SQL'
UPDATE usuarios
SET calendar_provider = 'caldav',
    calendar_auth_json = '<paste blob aquí>',
    calendar_acceso = 'write'
WHERE id = <user_id>;
SQL

pm2 restart maria-paez
```

Tras esto, las acciones `crear_evento`, `modificar_evento`, `borrar_evento` para ese usuario van a operar contra su CalDAV en vez de Google.

## Limitaciones de CalDAV vs Google

| Feature | Google | CalDAV |
|---|---|---|
| Crear evento con Meet | sí | no (CalDAV no tiene videocall integrada) |
| Share calendar entre users | invitación con confirmación | no — credenciales directas |
| Tier de acceso (read / write) | configurable por share | siempre `write` (es la cuenta del user) |
| `linkCrearEventoPrellenado` (UI prellenada) | sí | no |
| Listar `cumpleaños` de contactos | sí (calendar de cumpleaños) | no — Maria sigue usando su propio Google para esto |
| Free/Busy lookup | sí | depende del server (la mayoría sí) |

Métodos que apliquen sobre el calendar de Maria (`getMariaCalendarId`, `listarCumples`, `idCalendarioCumples`) **siempre delegan a Google**, sin importar el provider del user — porque la cuenta de Maria es siempre Google.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `no pude descifrar calendar_auth_json` | MARIA_VAULT_KEY cambió o el blob está corrupto | re-cifrar con la key actual |
| `el server X no devolvió calendars` | credenciales incorrectas o el server no expone calendars al user | verificar app password, confirmar que el user tiene al menos 1 calendar |
| `Unauthorized 401` al fetch | password vencido o cuenta sin 2FA habilitada | regenerar app password |
| iCloud devuelve 503 esporádicos | rate-limiting de iCloud | reintentar; tsdav no hace retry automático |
| Eventos creados no aparecen | el server cacheó la list — refetch en próxima call | esperar 5-10s |

## Implementación

- `providers/caldav.js` — provider con la interface `CalendarProvider` (mismo shape que `providers/google.js`).
- Usa `tsdav` (npm) para WebDAV/CalDAV. Importada dinámicamente (`await import('tsdav')`) por ser ESM-only.
- iCal: parser/generator inline mínimo (RFC 5545 §3.6 VEVENT). Para casos complejos (RRULE, recurrencias, VTIMEZONE) sería mejor `ical.js`, pero el set actual de operaciones de Maria no las necesita.

---

## Notas sobre `npm audit` (decisión 2026-05-17)

`tsdav@1.1.6` arrastra varias dependencias viejas que `npm audit` reporta con CVEs. Análisis del impacto real:

| Dep transitiva | CVE | Severity | ¿Aplica a Maria? |
|---|---|---|---|
| `cross-fetch` (vía tsdav) | DoS / SSRF en cadenas viejas | high | bajo riesgo — Maria solo lo usa contra endpoints CalDAV trusted (iCloud, Yahoo, Fastmail). No procesa input externo no-validado. |
| `semver` (vía levelup, dev only) | ReDoS | high | **no aplica** — `levelup` es transitivo de tooling, no se carga en runtime |
| `elliptic` (vía browserify-sign → crypto-browserify) | risky crypto primitive | high | **no aplica** — esa cadena es solo para builds de browser. Node.js usa `crypto` nativo |
| `bl` (vía levelup, dev only) | memory exposure | moderate | **no aplica** — runtime no toca esa cadena |

**Decisión**: aceptar las 11 vulnerabilities y NO forzar `npm audit fix --force`, porque eso upgradearía tsdav a 2.x (ESM-only) que rompe el `require()` y dynamic `import()` desde CJS. Re-evaluar si:

- aparece una versión 1.x mantenida de tsdav (poco probable),
- alguno de los CVE pasa de "transitivo no-runtime" a path real,
- decidimos migrar Maria a ESM (refactor grande, no en agenda).

Si se necesita una alternativa más limpia: implementación CalDAV ad-hoc con `node-fetch` + parser/generator iCal mínimo (~200 líneas — el provider actual ya tiene los helpers de iCal inline, solo faltaría el cliente WebDAV).
