#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node - <<'NODE'
(async () => {
  const mem = require('/root/secretaria/memory');
  const usuarios = require('/root/secretaria/usuarios');
  const gc = require('/root/secretaria/google-contacts');
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  let ok = 0, fail = 0; const errores = {};
  for (const u of usuarios.listarActivos()) {
    try { await gc.sincronizarUsuario(u); ok++; } catch (e) { fail++; errores[e.message.slice(0,60)] = (errores[e.message.slice(0,60)]||0)+1; }
    await dormir(700);
  }
  const rows = mem.db.prepare(`SELECT c.*, u.nombre AS dueno_nombre FROM contactos c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.id`).all();
  for (const c of rows) {
    try { await gc.sincronizarContacto(c, { dueno: c.dueno_nombre }); ok++; } catch (e) { fail++; errores[e.message.slice(0,60)] = (errores[e.message.slice(0,60)]||0)+1; }
    await dormir(700);
  }
  console.log(`backfill: ${ok} ok, ${fail} fallidos de ${16 + rows.length}`);
  for (const [msg, n] of Object.entries(errores)) console.log(`  ${n}x ${msg}`);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
NODE
