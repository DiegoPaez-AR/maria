// backfill-perfiles.js — enriquece perfil_web de los contactos con email que no
// lo tienen todavía. Pensado para correr DETACHED (nohup) — no en el inbox del
// cron (tarda ~90min). Idempotente: solo procesa perfil_web IS NULL, así que
// re-correrlo continúa donde quedó. Sequential + pausa para no martillar.
const mem = require('/root/secretaria/memory');
const { enriquecerContacto } = require('/root/secretaria/enriquecer-contacto');
(async () => {
  try { mem.db.pragma('busy_timeout = 8000'); } catch {}
  const rows = mem.db.prepare(
    "SELECT id, usuario_id, nombre, email FROM contactos WHERE email IS NOT NULL AND email != '' AND perfil_web IS NULL ORDER BY id"
  ).all();
  console.log(`[backfill] start ${new Date().toISOString()} — ${rows.length} contactos con email sin perfil`);
  let ok = 0, sin = 0, err = 0;
  for (const c of rows) {
    try {
      const p = await enriquecerContacto(c.usuario_id, { id: c.id, nombre: c.nombre, email: c.email });
      if (p) { ok++; console.log(`✓ #${c.id} ${c.nombre} (${c.email}) -> ${p}`); }
      else { sin++; console.log(`· #${c.id} ${c.nombre} (${c.email}) -> sin datos`); }
    } catch (e) { err++; console.log(`✗ #${c.id} ${c.nombre}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`[backfill] DONE ${new Date().toISOString()} — ok=${ok} sin=${sin} err=${err}`);
  process.exit(0);
})().catch(e => { console.log('[backfill] FATAL', e.message); process.exit(1); });
