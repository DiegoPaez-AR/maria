-- ──────────────────────────────────────────────────────────────────────────
-- control.sqlite — DB del servicio intensa-api
-- Vive separada de las DBs por-instancia. Maneja:
--   · catálogo de instancias activas (cada Maria-X)
--   · clientes globales (mapeo email/wa → instancia + usuario_id)
--   · signups pendientes (con TTL 10min)
--   · sesiones de portal de cliente (passwordless)
-- ──────────────────────────────────────────────────────────────────────────

-- Catálogo de instancias activas. El intensa-api consulta esta tabla para:
--   · decidir a qué Maria asignar un cliente nuevo (round-robin por capacidad)
--   · saber qué Maria hace de "signup-bot" (envía los códigos de verificación)
--   · saber dónde llegar a cada Maria (host + internal_port)
CREATE TABLE IF NOT EXISTS instances (
  slug              TEXT PRIMARY KEY,           -- 'maria-paez', 'maria-fernandez', etc.
  nombre            TEXT NOT NULL,              -- 'Maria Paez', etc.
  host              TEXT NOT NULL DEFAULT '127.0.0.1',
  internal_port     INTEGER NOT NULL,           -- puerto donde escucha el internal-api de esa Maria
  internal_secret   TEXT NOT NULL,              -- shared secret para autenticar requests del intensa-api
  max_usuarios      INTEGER NOT NULL DEFAULT 25,
  usuarios_actuales INTEGER NOT NULL DEFAULT 0, -- cache, actualizado cuando alta/baja un cliente
  estado            TEXT NOT NULL DEFAULT 'active' CHECK(estado IN ('active','full','maintenance','offline')),
  signup_bot        INTEGER NOT NULL DEFAULT 0, -- solo UNA instancia con signup_bot=1 (envía códigos)
  creado            DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clientes globales. Una fila por persona suscrita.
-- email/wa son UNIQUE para evitar duplicados cross-instancia.
CREATE TABLE IF NOT EXISTS clientes (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre                  TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  wa                      TEXT NOT NULL UNIQUE,           -- formato 549XXXXXXXX, sin @c.us
  calendar_provider       TEXT CHECK(calendar_provider IN ('google','microsoft','caldav','ninguno')),
  instancia_slug          TEXT NOT NULL,                  -- FK a instances.slug
  instancia_usuario_id    INTEGER,                        -- id del usuario en la DB de su instancia
  estado                  TEXT NOT NULL DEFAULT 'active' CHECK(estado IN ('active','inactive','cancelled')),
  -- LemonSqueezy
  lemon_customer_id       TEXT,
  lemon_subscription_id   TEXT UNIQUE,
  lemon_customer_portal   TEXT,                           -- URL del customer portal de LS (legacy)
  -- Stripe (sistema de pagos vigente)
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT UNIQUE,
  -- Trazabilidad de cobros
  ultimo_cobro_en         DATETIME,
  proximo_cobro_en        DATETIME,
  ultimo_evento           TEXT,                           -- último webhook recibido (subscription_*)
  ultimo_evento_en        DATETIME,
  -- Lifecycle
  creado                  DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado             DATETIME DEFAULT CURRENT_TIMESTAMP,
  inactivado_en           DATETIME,
  cancelado_en            DATETIME,                       -- al ponerse en cancelled, agendamos borrado +90d
  -- Aceptación de Términos y Condiciones (al momento del signup)
  terminos_aceptados_en   DATETIME NOT NULL,
  terminos_version        TEXT,                            -- ej 'v1-2026-05-19'
  -- FK soft (cross-DB, no enforceable en SQLite)
  FOREIGN KEY (instancia_slug) REFERENCES instances(slug)
);

CREATE INDEX IF NOT EXISTS idx_clientes_estado     ON clientes(estado);
CREATE INDEX IF NOT EXISTS idx_clientes_instancia  ON clientes(instancia_slug, estado);
CREATE INDEX IF NOT EXISTS idx_clientes_cancelado  ON clientes(cancelado_en) WHERE estado='cancelled';

-- Signup pendientes. TTL 10min (se extiende a 30min al verificar ambos códigos).
-- Códigos de 6 dígitos numéricos.
CREATE TABLE IF NOT EXISTS signup_pending (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre            TEXT NOT NULL,
  email             TEXT NOT NULL,
  wa                TEXT NOT NULL,
  calendar_provider TEXT,
  email_code        TEXT NOT NULL,
  wa_code           TEXT NOT NULL,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  wa_verified       INTEGER NOT NULL DEFAULT 0,
  -- intentos para defensa anti-brute-force
  email_intentos    INTEGER NOT NULL DEFAULT 0,
  wa_intentos       INTEGER NOT NULL DEFAULT 0,
  -- post-verificación: token que viaja a LS y vuelve por webhook
  signup_token      TEXT UNIQUE,                  -- JWT firmado, válido 30min tras verificación
  token_emitido_en  DATETIME,
  -- TTL
  creado            DATETIME DEFAULT CURRENT_TIMESTAMP,
  expira_en         DATETIME NOT NULL,             -- creado + 10min; al emitirse el signup_token se extiende a +30min
  -- Aceptación de Términos y Condiciones (obligatorio)
  terminos_aceptados_en DATETIME,
  -- Último reenvío de códigos (throttle anti-spam del botón "Reenviar")
  reenviado_en      DATETIME
);
CREATE INDEX IF NOT EXISTS idx_signup_expira ON signup_pending(expira_en);
CREATE INDEX IF NOT EXISTS idx_signup_token  ON signup_pending(signup_token) WHERE signup_token IS NOT NULL;

-- Sesiones del portal de cliente. Login passwordless.
CREATE TABLE IF NOT EXISTS portal_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE,         -- cookie value, criptográficamente random
  creado            DATETIME DEFAULT CURRENT_TIMESTAMP,
  expira_en         DATETIME NOT NULL,            -- 30min de validez
  ip_origen         TEXT,
  user_agent        TEXT
);
CREATE INDEX IF NOT EXISTS idx_portal_expira ON portal_sessions(expira_en);

-- Códigos OTP para portal (login passwordless + re-confirmación). Distintos a signup_pending.
-- proposito: 'login' (entrar al portal) o 'reauth' (confirmar operación sensible:
-- /cuenta/update y /cuenta/cancel exigen un OTP fresco emitido vía /cuenta/reauth-code).
CREATE TABLE IF NOT EXISTS portal_otp (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  canal             TEXT NOT NULL CHECK(canal IN ('email','wa')),
  proposito         TEXT NOT NULL DEFAULT 'login' CHECK(proposito IN ('login','reauth')),
  code              TEXT NOT NULL,                -- 6 dígitos
  intentos          INTEGER NOT NULL DEFAULT 0,
  usado             INTEGER NOT NULL DEFAULT 0,
  creado            DATETIME DEFAULT CURRENT_TIMESTAMP,
  expira_en         DATETIME NOT NULL              -- 10min
);
CREATE INDEX IF NOT EXISTS idx_portal_otp_cliente ON portal_otp(cliente_id, expira_en);

-- Webhook events recibidos de LemonSqueezy.
-- Idempotencia: dedupe por event_id de LS.
CREATE TABLE IF NOT EXISTS webhook_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ls_event_id     TEXT NOT NULL UNIQUE,           -- el `X-Event-Name` + body hash o un id propio de LS
  event_name      TEXT NOT NULL,                  -- subscription_created, etc.
  payload         TEXT NOT NULL,                  -- JSON crudo
  procesado       INTEGER NOT NULL DEFAULT 0,
  procesado_en    DATETIME,
  error           TEXT,
  recibido_en     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhook_procesado ON webhook_events(procesado, recibido_en);
