-- archive.sqlite — dumps de usuarios cancelados, después de +90 días.
-- Append-only. Sólo se consulta para auditoría manual.

CREATE TABLE IF NOT EXISTS clientes_archivados (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id_original INTEGER NOT NULL,
  nombre              TEXT,
  email               TEXT,
  wa                  TEXT,
  instancia_slug      TEXT,
  instancia_usuario_id INTEGER,
  lemon_customer_id   TEXT,
  lemon_subscription_id TEXT,
  creado_original     DATETIME,
  cancelado_en        DATETIME,
  archivado_en        DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- dumps JSON-encoded
  eventos_json        TEXT,   -- toda la tabla eventos del usuario
  contactos_json      TEXT,
  hechos_json         TEXT,
  pendientes_json     TEXT,
  programados_json    TEXT,
  notas_contacto_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_archivados_email ON clientes_archivados(email);
CREATE INDEX IF NOT EXISTS idx_archivados_wa    ON clientes_archivados(wa);
