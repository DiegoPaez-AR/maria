#!/bin/bash
# gcontacts-reconcile.sh — reconciliación SEMANAL libreta → Google Contacts
# (2026-08-04, decisión Diego: Google es espejo, nunca fuente; cualquier
# drift muere acá). Crontab: domingos 04:00.
# 2026-09-09: corre para TODAS las instancias (antes solo maria-paez: la
# libreta de Sofia nunca se reconciliaba).
cd /root/secretaria || exit 1
for cf in config/instances/*.conf; do
slug=$(basename "$cf" .conf)
(
set -a; . "$cf" 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
mkdir -p "/root/secretaria/state/$slug"
node - <<'NODE' 2>&1 | tail -30 >> /root/secretaria/state/$slug/gcontacts-reconcile.log
(async () => {
  const mem = require('/root/secretaria/memory');
  const usuarios = require('/root/secretaria/usuarios');
  const gc = require('/root/secretaria/google-contacts');
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  let ok = 0, fail = 0; const fallos = [];
  for (const u of usuarios.listarActivos()) {
    try { await gc.sincronizarUsuario(u); ok++; } catch (e) { fail++; fallos.push(`usuario "${u.nombre}": ${e.message.slice(0, 80)}`); }
    await dormir(800);
  }
  const rows = mem.db.prepare(`SELECT c.*, u.nombre AS dueno_nombre FROM contactos c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.id`).all();
  for (const c of rows) {
    try { await gc.sincronizarContacto(c, { dueno: c.dueno_nombre }); ok++; } catch (e) { fail++; fallos.push(`"${c.nombre}" (#${c.id}, de ${c.dueno_nombre}): ${e.message.slice(0, 80)}`); }
    await dormir(800);
  }
  const msg = `gcontacts-reconcile semanal (${process.env.ASISTENTE_SLUG || 'instancia'}): ${ok} ok, ${fail} fallidos`;
  console.log(new Date().toISOString(), msg);
  for (const f of fallos.slice(0, 25)) console.log('   FALLÓ', f);
  mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: msg + (fallos.length ? ` — ${fallos.slice(0, 5).join(' · ')}` : ''), metadata: { tipo: 'gcontacts_reconcile', fallos: fallos.slice(0, 25) } });
})().catch(e => console.error(new Date().toISOString(), 'gcontacts-reconcile FALLO:', e.message));
NODE
)
done
