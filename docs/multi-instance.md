# Multi-instance — agregar una nueva Maria

Cada "Maria" es una instancia independiente del mismo código fuente, con su
propia identidad (nombre, gmail, número de WhatsApp), su propia DB y su
propia cuenta de Claude. El código vive en un solo repo (este). Las configs
y los datos viven separados por instancia.

## Estructura

```
/root/secretaria/
  config/instances/
    maria-paez.conf      # config por instancia (en git, sin secrets)
    juan-sanchez.conf
  state/                 # NO en git (.gitignore)
    maria-paez/          # legacy: hoy los archivos viven en raíz; cuando
                         # se agregue una 2da instancia, se migran acá.
                         # db/, .wwebjs_auth/, token.json, credentials.json
    juan-sanchez/
      db/maria.sqlite
      .wwebjs_auth/
      token.json
      credentials.json
  ops/
    cron-master.sh       # corre cada minuto, itera todas las instancias
    instances/
      maria-paez/{inbox, outbox, snapshots}/
      juan-sanchez/{inbox, outbox, snapshots}/
  ecosystem.config.js    # pm2: lee config/instances/*.conf
```

## Pasos para agregar una instancia (ej. "Juan Sanchez")

### 1. Crear cuentas externas

- **Cuenta de Gmail dedicada** para la asistente, ej. `juan.sanchez.secre@gmail.com`.
  - Crear OAuth client en Google Cloud Console (Calendar + Gmail scopes).
  - Descargar `credentials.json`.
- **Número de WhatsApp dedicado**. Después de iniciar la instancia,
  escanear el QR desde ese teléfono.

### 2. Preparar carpetas en el VPS

```bash
ssh root@178.104.166.91
cd /root/secretaria
mkdir -p state/juan-sanchez/{db,.wwebjs_auth}
# Copiar credentials.json al state:
# Subir el archivo de Google Cloud Console (vía scp o pegado) a:
#   /root/secretaria/state/juan-sanchez/credentials.json
```

### 3. Crear el .conf

```bash
cat > config/instances/juan-sanchez.conf <<EOF_CONF
# Identidad
ASISTENTE_NOMBRE="Juan Sanchez"
ASISTENTE_SLUG=juan-sanchez
ASISTENTE_FROM_EMAIL=juan.sanchez.secre@gmail.com
ASISTENTE_TZ=America/Argentina/Buenos_Aires

# Owner
OWNER_NOMBRE=Juan
OWNER_EMAIL=juan@empresa.com
OWNER_WA=5491155555555@c.us
OWNER_CALENDAR_ID=juan@empresa.com

# Cap (opcional)
ASISTENTE_MAX_USUARIOS=10

# Paths de estado (per-instancia)
MARIA_DB=/root/secretaria/state/juan-sanchez/db/maria.sqlite
GOOGLE_TOKEN_PATH=/root/secretaria/state/juan-sanchez/token.json
GOOGLE_CRED_PATH=/root/secretaria/state/juan-sanchez/credentials.json
WA_AUTH_DIR=/root/secretaria/state/juan-sanchez/.wwebjs_auth

# Tunings (opcionales — defaults si se omiten)
WA_DEBOUNCE_MS=10000
GMAIL_POLL_MS=300000

# Cuenta de Claude (elegir UNA):
# A) API key directa (billing per-token):
# ANTHROPIC_API_KEY=sk-ant-...
# B) Settings file con OAuth de otra cuenta Pro/Max:
# CLAUDE_SETTINGS_FILE=/root/secretaria/state/juan-sanchez/claude-settings.json
# C) Heredada del VPS (default si no setear ninguna).
EOF_CONF
```

### 4. Autorizar Google OAuth

```bash
cd /root/secretaria
GOOGLE_CRED_PATH=/root/secretaria/state/juan-sanchez/credentials.json \
GOOGLE_TOKEN_PATH=/root/secretaria/state/juan-sanchez/token.json \
node auth-gmail.js
# Seguir el flow: abrir URL, autorizar como juan.sanchez.secre@gmail.com,
# pegar el código.
```

### 5. Levantar el proceso pm2

```bash
pm2 start ecosystem.config.js --only juan-sanchez
pm2 save
```

### 6. Escanear QR de WhatsApp

```bash
pm2 logs juan-sanchez --lines 60
# Ver el QR ASCII y escanearlo desde el teléfono nuevo.
# Cuando aparece "[WA ready]", listo.
```

### 7. Bootstrap del owner

La primera vez que el owner (Juan) le escriba a Maria por WA, queda
registrado como user activo. La instancia ya nace con los datos del owner
preconfigurados desde el .conf — no requiere setup adicional.

## Operación normal

- **Pull único**: `cron-master.sh` pullea el repo UNA sola vez por tick.
  Cuando hay cambio de código, restartea TODAS las instancias.
- **Push de estado**: cada instancia escribe sus snapshots y outputs en
  `ops/instances/<slug>/`. El cron pushea todo junto al final de cada tick.
- **Logs por instancia**: `pm2 logs <slug>` o ver `ops/instances/<slug>/snapshots/pm2-logs.txt`.

## Quitar una instancia

```bash
pm2 delete juan-sanchez
pm2 save
rm config/instances/juan-sanchez.conf
# state/juan-sanchez/ queda — borrar manual si querés liberar.
```
