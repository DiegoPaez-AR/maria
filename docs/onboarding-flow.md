# Onboarding de usuarios nuevos — flow completo

Cuando se da de alta un usuario nuevo, Maria detecta automáticamente qué provider de calendar usa basándose en el dominio del email y guía el flujo correcto sin que el operador tenga que intervenir manualmente.

## Detección automática

El helper `providers/detect.js` clasifica el email del usuario:

| Dominio | Provider | Estado |
|---|---|---|
| `@gmail.com`, `@googlemail.com` | google | ✅ activo |
| `@icloud.com`, `@me.com`, `@mac.com` | caldav (iCloud) | ✅ activo |
| `@yahoo.*`, `@ymail.com`, `@rocketmail.com` | caldav (Yahoo) | ✅ activo |
| `@fastmail.*`, `@messagingengine.com` | caldav (Fastmail) | ✅ activo |
| `@outlook.com`, `@hotmail.com`, `@live.com`, `@msn.com`, `@office365.com` | microsoft | ⚠️ bloqueado (Fase 2) |
| dominio custom | desconocido | el LLM pregunta |

Cuando Maria atiende a un usuario que tiene email + `calendar_acceso === 'none'` (no configurado todavía), el prompt incluye la sección `[PROVIDER DETECTADO]` con el sub-flow apropiado.

## Flow conversacional

### Paso 1 — Mensaje de bienvenida

Apenas se crea el usuario, Maria le manda un mensaje de bienvenida explicando qué puede hacer y cerrando con: "Para arrancar necesito saber qué calendar usás para poder integrarme: Google / Outlook / iCloud-Yahoo-otro".

### Paso 2 — Setup según provider

#### (2a) Google / Gmail

Tres opciones:
1. **Acceso completo (write)** — el user comparte su calendar con la cuenta Gmail de Maria con permiso "Hacer cambios y administrar uso compartido". Maria agenda directo en SU calendar.
2. **Solo lectura (read)** — el user comparte solo lectura. Maria ve para evitar conflictos pero agenda en su propio calendar.
3. **Sin acceso (none)** — no comparte nada. Maria pregunta disponibilidad antes de agendar.

Acción del LLM tras elección: `set_calendar_acceso` con modo `autodetect`.

#### (2b) iCloud / Yahoo / Fastmail (CalDAV)

Maria le pasa al user las instrucciones específicas del provider para generar un **app-specific password** (NO el password normal de la cuenta).

Cuando el user manda `username + password`, el LLM emite:

```json
{
  "tipo": "configurar_caldav",
  "server_url": "https://caldav.icloud.com/",
  "username": "user@icloud.com",
  "password": "xxxx-xxxx-xxxx-xxxx"
}
```

El executor:
1. Conecta a `server_url` con tsdav y descubre calendars.
2. Si OK: cifra el blob con `vault` y persiste en `usuarios.calendar_auth_json`. Setea `calendar_provider='caldav'` + `calendar_acceso='write'`.
3. Si falla: devuelve error claro ("password rechazada por el server, revisá que sea app-specific").
4. **Sanitiza el password en logs**: hace UPDATE sobre `eventos` recientes (últimos 30 min) reemplazando el literal del password por `[REDACTED]`.

Tras OK, el LLM le dice al user: *"Borrá el mensaje donde me pasaste el password. Yo lo guardé cifrado de mi lado."*

#### (2c) Outlook / Office 365 / Microsoft

Bloqueado todavía (Fase 2). El LLM avisa al user que "estamos sumando" y al owner por WA. Maneja al user sin acceso a su calendar (pregunta disponibilidad).

#### (2d) No usa calendar

Acepta, deja `calendar_acceso='none'`, siempre pregunta disponibilidad.

## Seguridad — manejo de passwords

El password del user CalDAV pasa por el chat (Maria no tiene otro canal). Mitigación en capas:

1. **Encriptación at-rest**: el blob completo en `usuarios.calendar_auth_json` está cifrado con vault (AES-256-GCM con `MARIA_VAULT_KEY`).
2. **Sanitización post-hoc de logs**: `_configurarCaldav` reemplaza el password literal en `eventos.cuerpo` (últimos 30 min) por `[REDACTED]`.
3. **Instrucción al user**: el LLM le pide al user que borre el mensaje del chat después.

**Lo que NO mitiga:**
- El password queda en los snapshots de WhatsApp Web del browser de Maria mientras esa sesión esté activa.
- Si el server CalDAV está comprometido, las credenciales se pueden extraer ahí.

Para el threat model actual (leak de DB / snapshot / backup) el approach es suficiente. Para amenazas más serias (acceso root al VPS), nada protege a las creds en runtime — el `MARIA_VAULT_KEY` está en el `.conf` de la instancia y descifra todo lo cifrado.

## Verificación

Tras `configurar_caldav` exitoso:

```bash
# En el VPS, con MARIA_VAULT_KEY en env:
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, nombre, email, calendar_provider, calendar_acceso, length(calendar_auth_json) FROM usuarios WHERE id = <user_id>;"
```

Debería mostrar:
- `calendar_provider = 'caldav'`
- `calendar_acceso = 'write'`
- `calendar_auth_json` con length > 0 (es el blob cifrado base64)

Y testear con el smoke test:
```bash
cd /root/secretaria
node -e "
(async () => {
  const usuarios = require('./usuarios');
  const providers = require('./providers');
  const u = usuarios.obtener(<user_id>);
  const p = await providers.forUser(u);
  console.log('provider kind:', p.kind);
  const cals = await p.listarCalendarios();
  console.log('calendars:', cals.map(c => c.summary).join(', '));
})();
"
```

## Limitaciones conocidas

- **Password en logs antes de la sanitización**: la sanitización corre TRAS `configurar_caldav` OK. Si el user manda el password y Maria tarda en reaccionar (LLM lento, queue, etc.), el password está en plano en `eventos.cuerpo` durante ese intervalo. Mitigación parcial: ventana de detección de 30 min, así si Maria llega tarde igual lo limpia.
- **No re-detecta provider si el user cambia de email**: el provider detectado se calcula al momento del prompt. Si el user cambia de email después, ejecutar `actualizar_usuario` y el flow vuelve a arrancar.
- **No hay re-config**: si el user quiere cambiar su CalDAV por otro server o credenciales, hay que pasar por `configurar_caldav` de nuevo (sobrescribe el blob existente).

## Tests

- `scripts/smoke-test-detect.js`: verifica que `detectarProvider()` clasifica correctamente emails de prueba (cada dominio conocido + uno desconocido).
- `scripts/smoke-test-caldav.js`: verifica end-to-end un CalDAV real con credenciales por env vars.

---

## Microsoft Graph (Fase 2 — activa desde 2026-05-17)

Setup de Azure (one-time, ya hecho):
- App registrada en portal.azure.com → "Maria Secretaria"
- Tipo: multi-tenant + cuentas personales (`AzureADandPersonalMicrosoftAccount`)
- Cliente público (sin secret) con PKCE
- Token version v2 (`requestedAccessTokenVersion: 2`)
- Scopes delegados: `Calendars.ReadWrite`, `Calendars.ReadWrite.Shared`, `offline_access`, `User.Read`
- Redirect URI: `http://localhost/maria-oauth-callback` (placeholder — usamos out-of-band)

### Variables del .conf

```
MS_CLIENT_ID=<UUID del registro Azure>
MS_TENANT=common
MS_REDIRECT_URI=http://localhost/maria-oauth-callback
```

### Flow conversacional

1. Detección: el dominio del email del user (e.g. `@outlook.com`, `@hotmail.com`) hace que `providers/detect.js` marque `kind='microsoft'`. La sección `[PROVIDER DETECTADO]` del prompt le dice al LLM que vaya por el flow 2c.

2. **Turno 1** — Maria emite:

   ```json
   { "tipo": "iniciar_microsoft_auth", "id": <usuario_id> }
   ```

   El executor genera PKCE pair (verifier+challenge), state random, arma la authorize URL contra `login.microsoftonline.com/common/oauth2/v2.0/authorize` con `client_id`, `scope`, `code_challenge`, `state`, y guarda el verifier+state+target_user_id en `estado_usuario.ms_oauth_pending` (clave del owner, TTL 15 min).

   La acción devuelve `{ auth_url, ... }`. El LLM le pasa la URL **exacta** al user en `respuesta_a_remitente`.

3. El user abre la URL en su browser, se loguea con su cuenta Microsoft, autoriza permisos. Microsoft redirige a `http://localhost/maria-oauth-callback?code=<largo>` (esa URL no existe — el browser muestra error "no se puede acceder a este sitio"). El user copia el valor del `code` de la URL y se lo manda a Maria por chat.

4. **Turno 2** — Maria emite:

   ```json
   { "tipo": "configurar_microsoft", "code": "<code que el user pasó>" }
   ```

   El executor:
   - Recupera el pending (verifier + state).
   - Intercambia el code (+ verifier) por `refresh_token + access_token` en `login.microsoftonline.com/.../token`.
   - Descubre el calendar default vía `GET /me/calendar` de Graph.
   - Cifra `{refresh_token, access_token, expires_at, scope, calendar_id}` con vault.
   - UPDATE `usuarios.calendar_auth_json` + setea `calendar_provider='microsoft'` + `calendar_acceso='write'`.
   - Sanitiza el code en `eventos.cuerpo` recientes (post-hoc UPDATE).
   - Limpia el pending de estado_usuario.

5. Maria le dice al user que borre el mensaje del chat con el code.

### Operación normal

Una vez configurado:
- `providers.forUser(usuarioMS)` devuelve `microsoftProvider` bound.
- Cada acción de calendar (`crear_evento`, etc.) sobre ese user invoca Microsoft Graph.
- El cache módulo-level de access_tokens evita refrescos repetidos.
- Cuando el access_token caduca (1h por default), el provider hace refresh con el refresh_token → Microsoft rota el refresh_token (sliding window) → persistimos el nuevo cifrado.

### Limitaciones

- **Tokens vienen con scope `User.Read` siempre** aunque solo pidamos Calendars — está OK, es el comportamiento estándar de MS.
- **No usamos shares de calendar** (Microsoft Graph las soporta pero el user opera con su propia cuenta — más simple).
- **No tenemos `linkCrearEventoPrellenado`** — Outlook Web no tiene un equivalente directo al `eventedit?...` de Google Calendar.
- **El refresh_token se rota** — si por algún motivo el blob cifrado se pierde o corrupta, hay que re-correr `iniciar_microsoft_auth` desde cero.

### Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `configurar_microsoft: el server rechazó el código` | code expiró (>15 min) o se copió mal | re-correr iniciar_microsoft_auth |
| `Microsoft no devolvió refresh_token` | falta scope `offline_access` en Azure | agregar el scope en portal.azure.com |
| `Property api.requestedAccessTokenVersion is invalid` (al guardar Azure) | manifest está en v1 | editar manifest: `api.requestedAccessTokenVersion: 2` |
| Auth URL muestra "AADSTS50194" | tu signInAudience no soporta cuentas personales | manifest: `signInAudience: AzureADandPersonalMicrosoftAccount` |
| Token refresh siempre falla | el refresh_token expiró (90 días sin usar) | re-correr iniciar_microsoft_auth |

### Implementación

- `providers/microsoft.js` — provider completo + helpers OAuth.
- `executor.js > _iniciarMicrosoftAuth + _configurarMicrosoft` — acciones del flow.
- Estado pendiente: `estado_usuario.ms_oauth_pending` del owner.
