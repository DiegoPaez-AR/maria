#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node auth-gmail.js exchange '4/0AXEQxIC3vRPUQtK9Ot3Z2pHrWKL_Pc3pvAoMfT03NKG1KPNuW-La4TabTLaC6jZ-DYis8A' 2>&1 | tail -2
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 8
echo "== backfill libreta → Google Contacts =="
node - <<'NODE'
(async () => {
  const mem = require('/root/secretaria/memory');
  const usuarios = require('/root/secretaria/usuarios');
  const gc = require('/root/secretaria/google-contacts');
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  let ok = 0, fail = 0;
  // usuarios primero (nombres en notificaciones WA)
  for (const u of usuarios.listarActivos()) {
    try { await gc.sincronizarUsuario(u); ok++; } catch (e) { fail++; console.log('✗ usuario', u.nombre, ':', e.message.slice(0, 80)); }
    await dormir(700);
  }
  // libretas de todos
  const rows = mem.db.prepare(`SELECT c.*, u.nombre AS dueno_nombre FROM contactos c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.id`).all();
  for (const c of rows) {
    try { await gc.sincronizarContacto(c, { dueno: c.dueno_nombre }); ok++; } catch (e) { fail++; console.log('✗', c.nombre, ':', e.message.slice(0, 80)); }
    await dormir(700);
  }
  console.log(`backfill: ${ok} ok, ${fail} fallidos, total ${usuarios.listarActivos().length} usuarios + ${rows.length} contactos`);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
NODE
