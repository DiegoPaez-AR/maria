// mb-control.js — canal de CONTROL REMOTO de MariaBridge (2026-08-18, idea
// Diego: "sacás una foto, me decís dónde tocar"). El operador (Claude/Diego
// via VPS) encola comandos; la app los recibe por el MISMO poll de
// pendiente.txt (prefijo CTL|) y sube el resultado a /mbctl.
//
// Comandos: ping · shot (screenshot) · tap {x,y} · home · nodos (dump de
// clickables). Los shots se publican en /_dl/shot-*.png (poda 30d via
// media-store que ya barre el dir).

const mem = require('./memory');
const fs = require('fs');
const crypto = require('crypto');

mem.db.exec(`CREATE TABLE IF NOT EXISTS mb_control (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  creado    DATETIME DEFAULT CURRENT_TIMESTAMP,
  cmd       TEXT NOT NULL,
  args      TEXT,
  estado    TEXT NOT NULL DEFAULT 'pendiente',
  resultado TEXT,
  resuelto  DATETIME
)`);

const PUB_DIR = '/var/www/intensa.io/_dl';
const PUB_URL = 'https://intensa.io/_dl';

function encolar(cmd, args = null) {
  const r = mem.db.prepare(`INSERT INTO mb_control (cmd, args) VALUES (?, ?)`)
    .run(String(cmd), args ? JSON.stringify(args) : null);
  console.log(`[mb-control] #${r.lastInsertRowid} encolado: ${cmd} ${args ? JSON.stringify(args) : ''}`);
  return r.lastInsertRowid;
}

// Sirve el próximo comando pendiente como línea "CTL|id|cmd|argsB64" (o null).
function siguiente() {
  // Re-armar huérfanos (22/8): un comando servido que no reportó resultado en
  // 3 min vuelve a pendiente — antes quedaba "enviado" para siempre si el
  // teléfono estaba ocupado o se cortó la red.
  try {
    // Tope de re-armes: 3 (columna intentos) — después se marca 'fallo' y se
    // deja de reintentar (el tap sin canPerformGestures loopeó el 22/8).
    try { mem.db.exec(`ALTER TABLE mb_control ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0`); } catch { /* ya existe */ }
    mem.db.prepare(
      `UPDATE mb_control SET estado='fallo', resultado=COALESCE(resultado,'sin respuesta tras 3 reintentos')
        WHERE estado='enviado' AND intentos >= 3`
    ).run();
    const r = mem.db.prepare(
      `UPDATE mb_control SET estado='pendiente', intentos=intentos+1
        WHERE estado='enviado' AND creado <= datetime('now','-3 minutes') AND intentos < 3`
    ).run();
    if (r.changes) console.log(`[mb-control] ${r.changes} comando(s) huérfano(s) re-armados`);
  } catch { /* noop */ }
  const row = mem.db.prepare(`SELECT * FROM mb_control WHERE estado='pendiente' ORDER BY id LIMIT 1`).get();
  if (!row) return null;
  mem.db.prepare(`UPDATE mb_control SET estado='enviado' WHERE id=?`).run(row.id);
  const argsB64 = Buffer.from(row.args || '{}').toString('base64');
  return `CTL|${row.id}|${row.cmd}|${argsB64}`;
}

// Resultado desde la app: {id, ok, data?(base64 png), texto?}
function resolver({ id, ok, data, texto }) {
  let resultado = texto || (ok ? 'ok' : 'fallo');
  if (data) {
    try {
      const buf = Buffer.from(String(data), 'base64');
      const nombre = `shot-${id}-${crypto.randomBytes(4).toString('hex')}.png`;
      fs.mkdirSync(PUB_DIR, { recursive: true });
      fs.writeFileSync(`${PUB_DIR}/${nombre}`, buf);
      try { fs.chmodSync(`${PUB_DIR}/${nombre}`, 0o644); } catch { /* noop */ }
      resultado = `${PUB_URL}/${nombre} (${Math.round(buf.length / 1024)}KB)` + (texto ? ` | ${texto}` : '');
    } catch (e) { resultado = `error guardando shot: ${e.message}`; }
  }
  mem.db.prepare(`UPDATE mb_control SET estado=?, resultado=?, resuelto=CURRENT_TIMESTAMP WHERE id=?`)
    .run(ok ? 'ok' : 'fallo', String(resultado).slice(0, 500), Number(id));
  console.log(`[MB-CTL] #${id} → ${ok ? 'OK' : 'FALLO'}: ${String(resultado).slice(0, 200)}`);
  return { id, resultado };
}

function estado(id) {
  return mem.db.prepare(`SELECT * FROM mb_control WHERE id=?`).get(Number(id));
}

module.exports = { encolar, siguiente, resolver, estado };
