#!/bin/bash
# gcontacts-reconcile.sh — reconciliación SEMANAL libreta → Google Contacts
# (2026-08-04, decisión Diego: Google es espejo, nunca fuente; cualquier
# drift muere acá). Crontab: domingos 04:00.
cd /root/secretaria || exit 1
cf=config/instances/maria-paez.conf
set -a; . "$cf" 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node - <<'NODE' 2>&1 | tail -5 >> /root/secretaria/state/maria-paez/gcontacts-reconcile.log
(async () => {
  const mem = require('/root/secretaria/memory');
  const usuarios = require('/root/secretaria/usuarios');
  const gc = require('/root/secretaria/google-contacts');
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  let ok = 0, fail = 0;
  for (const u of usuarios.listarActivos()) {
    try { await gc.sincronizarUsuario(u); ok++; } catch { fail++; }
    await dormir(800);
  }
  const rows = mem.db.prepare(`SELECT c.*, u.nombre AS dueno_nombre FROM contactos c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.id`).all();
  for (const c of rows) {
    try { await gc.sincronizarContacto(c, { dueno: c.dueno_nombre }); ok++; } catch { fail++; }
    await dormir(800);
  }
  const msg = `gcontacts-reconcile semanal: ${ok} ok, ${fail} fallidos`;
  console.log(new Date().toISOString(), msg);
  mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: msg, metadata: { tipo: 'gcontacts_reconcile' } });
})().catch(e => console.error(new Date().toISOString(), 'gcontacts-reconcile FALLO:', e.message));
NODE
