# Multi-Provider Calendar — Design Doc

**Status**: aprobado 2026-05-17. Pendiente implementación por fases.

## Problema

Hoy Maria está acoplada a Google: usa Google Calendar API para todos los users que atiende. Queremos soportar también:

- **Microsoft Graph** — Outlook, Hotmail, Office365.
- **CalDAV genérico** — iCloud, Fastmail, Yahoo (parcial), Nextcloud, Posteo, etc.

Sin romper a los users actuales (todos Google), y sin mezclar este cambio con el mailbox de Maria (que sigue siendo Gmail exclusivamente).

## Decisiones cerradas

1. **Solo calendar, no mailbox de users**. Maria sigue gestionando exclusivamente su propio mailbox (`maria.paez.secre@gmail.com`). Las integraciones nuevas son solo para acceder al **calendar** de los users que atiende. La memoria `Maria Gmail identity` queda firme: Maria nunca lee el mailbox de un user.
2. **Encripción nivel intermedio** para credenciales delegated: AES-256-GCM con key en env var del `.conf`, fuera de la DB. Ver sección "Seguridad" abajo.
3. **`MARIA_EMAIL` sigue siendo Gmail**. El mail de Maria no cambia con esta feature.

## Estado actual (referencia)

- `google.js` (~26KB) mezcla autenticación OAuth, operaciones de calendar (list/create/modify/delete), operaciones de gmail (read/respond/attach), y la constante `MARIA_EMAIL`.
- `usuarios.calendar_id` = string email. Las operaciones contra el calendar de un user asumen Google.
- Onboarding: el user comparte su calendar de Google con `maria.paez.secre@gmail.com`. Auto-accept ya implementado.
- `executor.js`, `meeting-prep.js`, `calendar-watch.js`, `morning-brief.js` llaman `g.crearEvento`, `g.modificarEvento`, etc., con un `auth` que viene de `g.autenticar()` (OAuth de Maria).

## Arquitectura propuesta

### Interface `CalendarProvider`

Cada provider implementa la misma firma:

```
async authenticate(usuario) → context
async listEvents(ctx, { calendarId, dias, max })
async createEvent(ctx, { calendarId, summary, start, end, attendees, ... })
async modifyEvent(ctx, { calendarId, eventId, patch })
async deleteEvent(ctx, { calendarId, eventId })
async checkAccess(ctx, calendarId) → 'none' | 'read' | 'write'
async listSharedCalendars(ctx)  // para autodetect en Google
async acceptShare(ctx, calendarId)  // solo Google (en CalDAV/Microsoft es OAuth, no share)
```

### Estructura de archivos

```
google.js              ← queda SOLO para Gmail de Maria. No toca calendar.
providers/
  index.js             ← factory: dado un usuario, devuelve el provider correcto
  google.js            ← lo que hoy es calendar+share en google.js
  microsoft.js         ← MS Graph
  caldav.js            ← CalDAV genérico (iCloud, Fastmail, Yahoo, Nextcloud)
vault.js               ← helpers crypto cifrar/descifrar para calendar_auth_json
```

### Columnas nuevas en `usuarios`

| Columna | Tipo | Default | Significado |
|---|---|---|---|
| `calendar_provider` | TEXT | `'google'` | `'google'` \| `'microsoft'` \| `'caldav'` |
| `calendar_auth_json` | TEXT | NULL | Blob de auth cifrado por provider. Google no lo usa (usa OAuth global de Maria). |

Migración automática: agregar columnas con default Google. Users existentes quedan iguales.

### Cambio conceptual importante

- **Google**: sigue funcionando por **share**. El user comparte su calendar con `maria.paez.secre@gmail.com`. Maria usa su propio OAuth (compartido entre todos los users Google) para operar. **No requiere credenciales del user en `calendar_auth_json`**.
- **Microsoft Graph**: usa **delegated access**. El user pasa por un OAuth flow donde autoriza a Maria a leer/escribir su calendar. El access token + refresh token se guardan cifrados en `calendar_auth_json` de ese user. Maria opera contra Graph con ese token específico.
- **CalDAV**: usa **credenciales del user** (URL del server + email + app-specific password). Se guardan cifradas en `calendar_auth_json`.

Implicación de privacidad: en Microsoft y CalDAV, las credenciales del user viven en la DB de Maria. Hay que comunicar esto al user durante el onboarding.

## Seguridad: encripción de `calendar_auth_json`

**Nivel elegido**: AES-256-GCM con key en env var del `.conf` (fuera de la DB).

**Módulo `vault.js`**:

```javascript
// Cifra un objeto con AES-256-GCM. Devuelve string base64 que incluye iv + tag + ciphertext.
// Para usar: const blob = vault.cifrar({ access_token, refresh_token, ... });
//             const obj = vault.descifrar(blob);
```

**Key**: 32 bytes hex generados con `openssl rand -hex 32`. Vive en `MARIA_VAULT_KEY` en el `.conf` de cada instancia. No se commitea.

**Threat model**:
- Mitiga: leak de DB sin acceso al `.conf` (backup mal manejado, snapshot del VPS sin acceso al filesystem completo, copia para debug).
- No mitiga: compromiso completo del VPS con shell root. Las keys están en runtime de algún modo; eso ningún nivel previene del todo sin sacarlas del servidor (KMS externo, fuera de scope).

**Asimetría conocida**: el token OAuth de Maria (`state/<slug>/token.json`) hoy está en plain text. Aplicar B solo a `calendar_auth_json` deja asimétrico: tokens de users cifrados, token de Maria no. Solución pragmática: arrancar con B para users nuevos, dejar migración de `token.json` de Maria → vault como **Fase 5** (no bloquea rollout).

## Plan por fases

### Fase 1 — Refactor sin agregar providers (no-regresión)

Objetivo: dejar la arquitectura provider-based con un único provider (Google) implementado. Punto cero de no-regresión.

Cambios:
- Crear `providers/index.js` con factory `forUser(usuario)`.
- Crear `providers/google.js` con todo lo que es calendar de `google.js`.
- `google.js` queda solo con Gmail + autenticación compartida + constantes.
- Reemplazar todas las llamadas `g.crearEvento(...)`, `g.modificarEvento(...)`, etc., por `providers.forUser(usuario).createEvent(...)` en: `executor.js`, `meeting-prep.js`, `calendar-watch.js`, `morning-brief.js`, `gmail-handler.js` (auto-accept).
- Migración SQL: agregar columna `usuarios.calendar_provider` con default `'google'`. Agregar `calendar_auth_json` NULL.
- Crear `vault.js` (sin uso aún en esta fase).
- Generar `MARIA_VAULT_KEY` y agregar al `.conf` de maria-paez.

**Sin cambios funcionales visibles**. Maria sigue funcionando idéntico. Si esta fase rompe algo, se revierte. **Esta es la fase más larga porque toca muchos archivos**.

### Fase 2 — Microsoft Graph

- Registrar app en Azure Portal (acción manual de Diego). Permisos: `Calendars.ReadWrite` delegated.
- `providers/microsoft.js` con OAuth flow + Graph API endpoints para Calendar.
- Acción nueva `set_calendar_provider(usuarioId, 'microsoft')` que genera link OAuth y lo manda al user por WA.
- Callback handler (puede ser un endpoint chico en un puerto del VPS o un copy-paste del code post-autorización).
- Token guardado en `calendar_auth_json` cifrado.
- Onboarding del LLM: cuando se crea user nuevo, preguntar provider. Si Microsoft → flow nuevo.
- Test con cuenta Office365 de prueba.

### Fase 3 — CalDAV

- `providers/caldav.js` con librería `tsdav` (preferida) o `caldav-adapter`.
- Onboarding: pedir URL + email + app-specific password por chat (o web form mínimo si lo queremos más prolijo).
- Test con iCloud o Fastmail.

### Fase 4 — Onboarding UX

- Maria pregunta al user nuevo qué calendar usa (Gmail/Outlook/iCloud/Otro).
- Flow por provider integrado en el handshake de creación de user.
- Update de los hechos de la memoria del owner: instrucciones de cómo cada provider responde.

### Fase 5 — (opcional) Migrar `token.json` de Maria a vault

Solo si Diego lo pide explícitamente. No bloquea las fases anteriores.

## Decisiones cerradas en este doc

| Decisión | Resuelto |
|---|---|
| ¿Maria lee mailbox de users? | NO. Solo calendar. |
| Encripción `calendar_auth_json` | AES-256-GCM, key en `.conf` |
| `MARIA_EMAIL` cambia? | No. Sigue Gmail. |
| Token de Maria cifrado? | Más adelante (Fase 5 opcional). |

## Decisiones aún abiertas (no bloqueantes)

- **Onboarding via web form vs WA**: para Microsoft/CalDAV el flow OAuth/credenciales es incómodo por WA. Podríamos levantar un endpoint web chico en el VPS (`/onboard?provider=microsoft&user_id=...`). Decisión: arrancar via WA (mensajes guiados); si se vuelve muy fricción, agregar web form en una fase futura.
- **Provider order de implementación**: Sugiero Microsoft primero (más demanda corporativa). Si tu prioridad es otra (caso concreto que aparece, por ej. alguien con iCloud), avisame.
