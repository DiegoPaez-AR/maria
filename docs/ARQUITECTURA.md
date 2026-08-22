# Arquitectura de Maria

*Última revisión: 22 de agosto de 2026.*

Maria es una secretaria personal que atiende a ~16 usuarios por tres canales
(WhatsApp, Telegram y mail), les maneja agenda, pendientes y comunicaciones, y
recuerda lo que va aprendiendo de cada uno. Corre en un VPS de Hetzner
(`178.104.166.91`, Ubuntu, 4 GB) y usa un teléfono Android como puerta de
entrada y salida de WhatsApp.

Este documento es el mapa. Está ordenado de afuera hacia adentro: primero cómo
entra un mensaje, después qué pasa con él, después cómo sale la respuesta, y al
final la maquinaria de operación (deploys, backups, monitoreo).

---

## 1. El mapa en una pantalla

```
                    ┌──────────────────────────────────────────┐
   WhatsApp ──┐     │            VPS Hetzner                   │
   (teléfono) │     │                                          │
              ├────►│  internal-api ──► wa-hook ──┐             │
   Telegram ──┤     │  (HTTP :puerto)             │             │
   (long poll)│     │                             ▼             │
              │     │  telegram-handler ──►  prompt-builder     │
   Gmail ─────┘     │  gmail-handler         claude-client      │
   (poll 60s)       │                        session-manager    │
                    │                             │             │
                    │                             ▼             │
                    │                    executor / MCP tools   │
                    │                             │             │
                    │              ┌──────────────┼──────────┐  │
                    │              ▼              ▼          ▼  │
                    │          wa-send        google.js   memory│
                    │              │          (cal+mail)  SQLite│
                    │              ▼                            │
                    │          wa_outbox ──► el teléfono         │
                    └──────────────────────────────────────────┘
```

Todo el estado vive en **una base SQLite por instancia**. No hay Redis, ni cola
externa, ni microservicios. El proceso es uno solo (`maria-paez` en pm2) y los
loops periódicos corren adentro.

---

## 2. Canales de entrada

### 2.1 WhatsApp — MariaBridge

WhatsApp **no** tiene API en este diseño. La entrada y la salida las hace una
app Android propia, **MariaBridge** (Kotlin, `io.intensa.mariabridge`), que vive
en un teléfono dedicado con el número **+54 9 11 6644-6137**.

La app hace cuatro cosas:

- **Recibe**: un `NotificationListener` captura las notificaciones de WhatsApp y
  las postea al `wa-hook` del VPS. Filtra ecos, reacciones, notificaciones de
  servicio y duplicados.
- **Responde en silencio**: usa el `RemoteInput` de la notificación viva. La
  respuesta sale sin abrir la app y sin que la pantalla se prenda.
- **Inicia chats** ("cold send"): un `AccessibilityService` abre el chat con un
  intent local (`whatsapp://send?phone=`), **verifica que el título del chat
  abierto sea el destinatario correcto** y recién ahí toca enviar buscando el
  botón por su ID de vista, nunca por coordenada.
- **Caza media**: audios, imágenes, PDFs y videos que llegan por WhatsApp los
  levanta del disco y los sube al VPS para que Maria los escuche o los vea.

Además tiene **manos remotas** (`shot`, `tap`, `nodos`, `home`, `ping`,
`despertar`): desde el VPS se le puede pedir una captura de pantalla o un toque
en una coordenada. Eso permite operar el teléfono sin tenerlo en la mano —
incluso instalar actualizaciones.

**Por qué una app propia**: antes eran tres apps de terceros encadenadas
(AutoResponder + Tasker + AutoInput). Cada una con su configuración frágil y sin
forma de diagnosticar nada. La app propia unifica todo y manda sus logs al VPS.

### 2.2 Telegram

`telegram-handler.js` hace long polling contra la Bot API (`@MariaPaezAI_bot`).
Solo atiende a usuarios **vinculados** (que compartieron su número). Un
desconocido recibe un mensaje fijo, salvo que un pre-pass barato detecte que es
un tercero respondiendo una gestión abierta.

Desde la política v5, **Telegram es el canal principal de los usuarios**.

### 2.3 Gmail

`gmail-handler.js` pollea la casilla `maria.paez@intensa.io` cada 60 segundos.
Maria **nunca** lee el mail personal de nadie: tiene su propia cuenta. Si el
remitente no matchea a un usuario, entra al `unknown-flow`, que decide si es un
tercero de alguna gestión, un prospecto, o ruido de sistema.

---

## 3. El cerebro

### 3.1 Cómo se arma un turno

`prompt-builder.js` construye el prompt con secciones: identidad, reglas de
seguridad, la agenda de los próximos 7 días, los pendientes abiertos, los
mensajes programados, la libreta de contactos relevante, los hechos que Maria
recuerda del usuario, el historial reciente y el mensaje entrante.

Medido sobre la instancia real: el bloque fijo (*system*) pesa unos **57.800
caracteres** y el contexto del turno (*user*) unos **24.300**. En tokens, unos
23.400 por turno.

### 3.2 Sesiones persistentes

`session-manager.js` usa la continuación de conversación de la CLI (`--resume`):
las reglas y el contexto inicial se mandan **una sola vez** al abrir la sesión y
los turnos siguientes mandan solo el delta. El turno compacto pesa ~2.700 tokens
contra los 23.400 del turno completo.

Salvaguardas: rotación por cantidad de turnos, por antigüedad y **por cambio del
prompt** (si un deploy cambia las reglas, la sesión vieja se descarta —
si no, seguiría razonando con reglas viejas). Hay un mutex por usuario para que
dos turnos simultáneos no bifurquen la conversación.

Se controla con `MARIA_SESIONES=1` y, para rollout gradual,
`MARIA_SESIONES_USUARIOS` (lista de nombres o ids).

Los turnos de **terceros corren siempre sin sesión**, a propósito: no se mezclan
interlocutores distintos en la historia lineal de un usuario.

### 3.3 Ejecución de acciones

`action-schemas.js` es la **fuente única** de las acciones que Maria puede
hacer: crear un evento, mandar un mail, guardar un contacto, agendar un
pendiente, etc. De ahí se generan los tools MCP que ve el modelo.

El modelo llama al tool, el tool pega a `/accion` de la internal-api, y
`executor.js` lo ejecuta **en el proceso principal**, con el runtime completo
(moderación, validación de destinatarios, política de canales). El resultado
vuelve al modelo en el mismo turno: si la acción falló, lo ve y no puede
afirmar que la hizo.

Hay además un backstop determinístico: si una acción visible falló y el modelo
igual dice que salió, el handler le anexa un aviso honesto a la respuesta.

---

## 4. La salida

### 4.1 Política de canales (v5.1)

La regla, decidida después de tres sanciones de Meta:

- **A los usuarios NUNCA se les escribe por WhatsApp.** Telegram si están
  vinculados, mail si no. Si un usuario escribe por WhatsApp, recibe una
  negativa fija —sin turno del modelo— que lo invita a Telegram o mail.
- **A los terceros sí**, porque ahí WhatsApp es la herramienta de trabajo:
  reservar una mesa, coordinar con un proveedor. Preferencia Telegram → mail →
  WhatsApp.

El guard vive en `wa-send.js`, y desde el 22/8 **también en el executor**:
`enviar_wa` resuelve el número contra la tabla de usuarios antes de encolar. Si
no, un número crudo esquivaba la política. El razonamiento de fondo: si Maria le
escribe a un usuario por WhatsApp y esa persona contesta por ahí, se choca con
la negativa fija. Abrir una conversación en un canal que después le cerrás no
tiene sentido.

### 4.2 La cola de salida y el comportamiento humano

Los mensajes que Maria **inicia** por WhatsApp van a la tabla `wa_outbox` y el
teléfono los drena. Encima hay una capa deliberada para que el uso no parezca de
bot:

| Mecanismo | Qué hace |
|---|---|
| Ventana horaria | Fuera de 8–23 no se sirve nada; queda en cola |
| Jitter | 30 s a 4 min antes de servir (se acabaron los envíos en punto) |
| Cadencia | 3 a 8 min entre chats distintos (dentro del mismo chat no aplica) |
| Typing simulado | 5–20 s proporcional al largo antes de tocar enviar |
| Espera al responder | 4–25 s |
| Opt-out | `contactos.no_contactar` bloquea aunque el modelo insista |
| Tope de aperturas | 12 por hora, en el propio teléfono |

**Consecuencia importante**: encolar **no** es enviar. Entre que Maria dice
"listo" y el mensaje sale pueden pasar minutos. Por eso la acción devuelve
`encolado: true, enviado: false` y una nota que le ordena decir "se lo mando
ahora", nunca "ya se lo mandé".

La entrega es **verificada**: el teléfono confirma que el mensaje salió de
verdad (el campo de texto quedó vacío) antes de marcarlo entregado. Si no puede,
reporta el motivo (`numero_sin_whatsapp`, `chat_equivocado`, `timeout_sin_boton`)
con tope de 5 intentos y aviso al owner.

### 4.3 Calendario y mail

`google.js` maneja Gmail y Google Calendar con OAuth. El refresh token se guarda
**cifrado** (`vault.js`, AES-256-GCM) con una clave que vive fuera de la base.
Hay soporte para otros proveedores de calendario: CalDAV (iCloud, Yahoo,
Fastmail) y Microsoft Graph.

Cada usuario tiene un *tier* de acceso a su calendario —completo, solo lectura o
ninguno— y el executor decide dónde crear cada evento según eso.

---

## 5. Persistencia y memoria

`memory.js` es la capa SQLite. La base vive en
`/root/secretaria/state/<slug>/db/maria.sqlite`. Tablas principales:

- `usuarios` — quién es cada uno, sus canales, su tier de calendario, su idioma
  y su zona horaria.
- `contactos` — la libreta **por usuario**. Un contacto de Diego no es visible
  para otro usuario.
- `eventos` — todo lo que entra y sale, por canal y dirección. Es el historial y
  también la telemetría (tokens, costo).
- `pendientes` y `follow_ups` — modelo de dueño (usuario o Maria) por disparador.
- `hechos` — la memoria de largo plazo: preferencias, datos, contexto.
- `programados` — mensajes futuros.
- `wa_outbox`, `wa_diferidos`, `mb_control` — colas del canal WhatsApp.

**El aislamiento entre usuarios es estricto.** Es la propiedad de seguridad más
importante del sistema: cada consulta filtra por `usuario_id`, y solo el owner
puede crear o dar de baja usuarios.

La memoria de largo plazo tiene un job nocturno (`memoria-curada.js`) que
sintetiza las interacciones por par usuario×contacto. Los hechos conviene
auditarlos cada tanto: los que son temporales (una ausencia, una cotización)
quedan fijos para siempre si nadie los revisa.

---

## 6. Seguridad

Cinco capas, de afuera hacia adentro:

1. **Restricción de tools**: el modelo solo puede llamar lo que está en
   `action-schemas.js`.
2. **Reglas en el prompt**: qué puede y qué no, con el aislamiento explícito.
3. **Validación de destinatarios** (`seguridad.js`): antes de mandar cualquier
   cosa se verifica que el destino esté en la libreta visible del usuario
   atendido, o sea un usuario activo. Cubre `to`, `cc`, `bcc` y `replyTo` — un
   `bcc` sin validar era un canal de exfiltración.
4. **Sandbox**: el modelo corre en `bwrap`, con bind-mounts acotados. Los
   adjuntos solo pueden vivir bajo un prefijo fijo (`/tmp/maria-attach-`).
5. **Auditoría y rate limit**: todo saliente queda logueado; hay tope de
   mensajes por usuario y por ventana.

Encima de eso: detección de prompt injection (telemetría, no bloqueo),
moderación de contenido con un clasificador barato en cada saliente, y un gate
que impide que un turno iniciado por un tercero mande cosas a destinos que no
sean el usuario atendido.

---

## 7. Los loops

Corren dentro del proceso principal, cada uno con su intervalo:

| Loop | Qué hace |
|---|---|
| `gmail poll` | Lee la casilla de Maria cada 60 s |
| `recordatorios` | Avisos de pendientes |
| `programados` | Dispara los mensajes futuros |
| `morning-brief` | Brief diario por usuario, en su huso y con su clima |
| `meeting-prep` | 15 min antes de cada reunión, con contexto de los asistentes |
| `calendar-watch` | Detecta cambios en los calendarios |
| `follow-ups` | "Si no me responde en N días, avisame" |
| `maria-worker` | Ejecuta las tareas propias de Maria |
| `cumple-avisos` | Cumpleaños, la noche anterior |
| `resumen-semanal` | Domingos |
| `poda-eventos` | Retención de telemetría |
| `diferidos-drainer` | Larga a las 8 lo que quedó en horas de silencio |
| `wa-hook-watchdog` | Avisa si el teléfono deja de dar señales |

Todos pasan por `loop-guard.js`: si uno falla N veces seguidas por la misma
causa, avisa al owner una sola vez y otra al recuperarse.

---

## 8. Operación

### 8.1 El canal asincrónico de deploy

No hay CI. El VPS pullea el repo **cada minuto** (`ops/cron-master.sh`) y:

1. Si cambió código, corre el **canary** y recién entonces recarga pm2.
2. Ejecuta los scripts que aparezcan en `ops/instances/<slug>/inbox/*.sh` y deja
   la salida en `outbox/`.
3. Dumpea un snapshot del estado y pushea todo de vuelta al repo.

Ese inbox/outbox es la forma en que se opera el VPS desde afuera sin SSH: se
deja un script, se espera un minuto, se lee el resultado.

**El canary** valida antes de recargar: sintaxis de todos los `.js`, un
require-smoke de ~45 módulos con paths pisados a scratch, un detector de
**helpers huérfanos** (funciones llamadas pero nunca definidas — ni la sintaxis
ni el require las ven) y los tests unitarios. Si algo falla: no recarga,
revierte el runtime al último commit bueno, deja un marcador y avisa al owner.
Producción sigue con la versión anterior en memoria.

**Trampas conocidas del canal:**

- Los cambios a `cron-master.sh` tienen **lag de un tick**: el tick que baja la
  versión nueva corre todavía la vieja. Nunca pushear un cambio al cron junto
  con código que dependa de él.
- El cron toma un **lock global**. Un script del inbox que no termina congela el
  canal entero, en silencio. Por eso los scripts corren con `timeout 300` y el
  healthcheck mata cualquier tick de más de 10 minutos.
- **Nunca** requerir `./index` en un chequeo: `index.js` arranca Maria al
  cargarse. Un require-smoke que lo incluya levanta una segunda instancia
  completa que se pelea con la real por el polling de Telegram.

### 8.2 Backups, healthcheck y reportes

- **Backup semanal** cifrado a una rama del repo, con restore-test automático
  después de cada backup (descifra, verifica integridad y presencia de los
  archivos clave). Si el backup no se puede verificar, avisa.
- **Healthcheck** cada 5 minutos. Avisa al owner por su canal y deja la alerta
  en el repo si no puede avisar. Es también el que rescata el canal de deploy.
- **daily-report** a las 06:00: actividad de las últimas 24 h, embudo de
  suscripción, rebotes de mail y **costo recalculado desde los tokens** con el
  precio vigente por fecha.

### 8.3 Multi-instancia y white-label

El sistema está preparado para correr varias Marias en el mismo VPS: un `.conf`
por instancia, una base por instancia, un proceso pm2 por instancia. El script
`ops/provision/nueva-instancia.sh` da de alta una instancia nueva entera.
`ops/backend/intensa-api` maneja las suscripciones y el alta desde la web.

**Trampa**: pm2 **no borra** variables de entorno cuando las sacás del `.conf`,
las mergea. Para desactivar algo hay que ponerlo en `=0`, nunca borrar la línea.

---

## 9. Lo que ya no existe

Vale la pena decirlo explícitamente, porque queda mencionado en documentación
vieja y en comentarios del código:

- **`whatsapp-web.js` y Puppeteer** — jubilados el 22/8/2026. Durante meses
  Maria se conectaba a WhatsApp con un Chromium headless que se hacía pasar por
  WhatsApp Web. Con MariaBridge dejó de tener sentido. Se fueron con él: el QR,
  el modo degradado y unos 80 MB de dependencias.
- **El túnel SSH** — existía para que el Chromium saliera con IP argentina desde
  la Mac de Diego. Sin Chromium, no hay túnel. `docs/wa-tunel.md` quedó
  obsoleto.
- **AutoResponder, Tasker y AutoInput** — las tres apps de terceros que hacían
  lo que ahora hace MariaBridge.

---

## 10. Runbook: qué mirar cuando algo falla

| Síntoma | Primero mirá |
|---|---|
| No llegan snapshots al repo | El lock del cron (`fuser -v /tmp/maria-cron-master.lock`) y la antigüedad del proceso. Silencio del canal **no** es lo mismo que VPS caído |
| ¿Maria está viva? | `GET /hooks/wa-maria/<secret>/mbdiag` → `{"ok":true}` |
| Un WhatsApp "no salió" | `wa_outbox`: mirá `estado`, `intentos` y `no_antes`. Puede estar esperando la pausa humana |
| El teléfono no responde | `mb-remoto.sh ping`; si da `root null`, la pantalla está apagada → `despertar` |
| El deploy no se aplicó | `state/.canary-bad-commit` y el `ops/.cron.log` |
| Maria dice que hizo algo que no hizo | Los resultados del turno; el backstop debería haberlo anexado |
| "No tengo internet" | Falta `WebSearch`/`WebFetch` en `CLAUDE_ALLOWED_TOOLS` del `.conf` |

---

## 11. Dónde está cada cosa

```
/root/secretaria/
├── index.js              arranque y loops
├── memory.js             SQLite (2.100 líneas, el corazón)
├── executor.js           ejecuta las acciones
├── prompt-builder.js     arma el prompt
├── claude-client.js      wrapper de la CLI
├── session-manager.js    sesiones persistentes
├── action-schemas.js     fuente única de las acciones
├── seguridad.js          validación de destinatarios, injection, rate limit
├── wa-hook.js            entrada de WhatsApp
├── wa-outbox.js          cola de salida de WhatsApp
├── wa-send.js            política de canales
├── telegram-handler.js   canal Telegram
├── gmail-handler.js      canal mail
├── unknown-flow.js       remitentes desconocidos
├── gestion-ajena.js      ruteo por identidad, no por canal
├── google.js             calendar + gmail
├── vault.js              cifrado de secretos
├── config/
│   ├── instances/*.conf  una por instancia
│   └── secrets.conf      gana sobre el resto
├── state/<slug>/         base, sesiones, markers
├── docs/                 esta documentación
└── ops/
    ├── cron-master.sh    el latido de todo
    ├── instances/<slug>/{inbox,outbox,snapshots}
    ├── mariabridge/      la app Android (Kotlin)
    ├── provision/        alta de instancias nuevas
    ├── scripts/          backup, healthcheck
    ├── sites/            la landing
    └── tools/            mb-remoto, huerfanos, programados-ctl
```

---

## 12. Principios que vale la pena no perder

Estos no son detalles de implementación, son decisiones de fondo que costaron
incidentes reales:

1. **Maria es única; la conversación sigue a la persona, no al canal.** Los
   handlers de WhatsApp, Telegram y mail son adaptadores de un mismo cerebro.
2. **Nunca confirmar algo que no se verificó.** "Entregado" tiene que significar
   entregado, no intentado. Cada vez que se relajó esto, hubo un incidente.
3. **Todo reintento necesita un tope.** Sin excepción.
4. **Un aviso que falla no puede generar otro aviso.** La recursión de errores
   fue lo que gatilló una de las sanciones de Meta.
5. **El silencio es una respuesta legítima.** Mejor callarse que decir algo
   redundante.
6. **Matcheo estricto o nada** al rutear mensajes. Un `contains` laxo mandó diez
   mensajes al chat equivocado.
7. **Nada de evadir sanciones.** Si Meta marca la cuenta: apelar o migrar a la
   API oficial. No rotar números ni usar proxies.
