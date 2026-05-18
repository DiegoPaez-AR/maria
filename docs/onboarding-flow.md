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
