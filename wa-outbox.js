// wa-outbox.js — cola de mensajes que Maria INICIA por WhatsApp (2026-08-04).
//
// AutoResponder solo responde notificaciones: no puede iniciar chats. Para
// iniciar, el teléfono corre Tasker, que cada minuto pregunta a este VPS si
// hay algo pendiente; si hay, abre wa.me/<numero>?text=... y toca enviar.
// Todo sale por la app oficial de WhatsApp (mismo perfil que un humano).
//
// Endpoints (en internal-api, bajo /wa-hook/<secret>/...):
//   GET  .../pendiente        → { id, numero, texto } | {}
//   POST .../confirmar {id}   → marca enviado
//
// Salvaguardas: solo un mensaje por poll (goteo natural), TTL 6h (si el
// teléfono estuvo apagado no mandamos algo viejo), reintentos capeados.

const mem = require('./memory');

mem.db.exec(`CREATE TABLE IF NOT EXISTS wa_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_id  INTEGER,
  numero      TEXT NOT NULL,          -- solo dígitos, formato internacional
  texto       TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|entregado|vencido
  intentos    INTEGER NOT NULL DEFAULT 0,
  tomado_en   DATETIME,
  entregado   DATETIME,
  metadata_json TEXT
)`);

const TTL_H = Number(process.env.WA_OUTBOX_TTL_H || 6);
const MAX_INTENTOS = 3;

function encolar({ usuarioId = null, numero, texto, metadata = null }) {
  const digs = String(numero || '').replace(/\D/g, '');
  if (!digs || digs.length < 8) throw new Error(`wa-outbox: número inválido "${numero}"`);
  if (!texto || !String(texto).trim()) throw new Error('wa-outbox: texto vacío');
  const r = mem.db.prepare(
    `INSERT INTO wa_outbox (usuario_id, numero, texto, metadata_json) VALUES (?, ?, ?, ?)`
  ).run(usuarioId, digs, String(texto), metadata ? JSON.stringify(metadata) : null);
  console.log(`[wa-outbox] #${r.lastInsertRowid} encolado → +${digs} (${String(texto).slice(0, 40)}…)`);
  return r.lastInsertRowid;
}

// Vence lo viejo y devuelve UNO pendiente (el más antiguo vigente).
function siguiente() {
  mem.db.prepare(
    `UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente' AND (creado <= datetime('now', ?) OR intentos >= ?)`
  ).run(`-${TTL_H} hours`, MAX_INTENTOS);
  const row = mem.db.prepare(
    `SELECT * FROM wa_outbox WHERE estado='pendiente' ORDER BY id ASC LIMIT 1`
  ).get();
  if (!row) return null;
  mem.db.prepare(`UPDATE wa_outbox SET intentos = intentos + 1, tomado_en = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  return { id: row.id, numero: row.numero, texto: row.texto };
}

function confirmar(id) {
  const row = mem.db.prepare(`SELECT * FROM wa_outbox WHERE id = ?`).get(Number(id));
  if (!row) return false;
  mem.db.prepare(`UPDATE wa_outbox SET estado='entregado', entregado=CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  try {
    mem.log({
      usuarioId: row.usuario_id, canal: 'whatsapp', direccion: 'saliente',
      de: `${row.numero}@c.us`, cuerpo: row.texto,
      metadata: { via: 'tasker_outbox', outboxId: row.id },
    });
  } catch {}
  console.log(`[wa-outbox] #${row.id} entregado por el teléfono`);
  return true;
}

module.exports = { encolar, siguiente, confirmar };
