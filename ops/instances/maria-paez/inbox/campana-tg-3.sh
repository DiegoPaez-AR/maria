#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
export CAMP_SECRET="$SECRET" CAMP_PORT="$PORT"
cat > /tmp/campana-tg.mjs <<'NODE'
import Database from '/root/secretaria/node_modules/better-sqlite3/lib/index.js';
const db = new Database(process.env.MARIA_DB, { readonly: true });
const users = db.prepare("SELECT id,nombre,wa_cus FROM usuarios WHERE activo=1 AND (servido IS NULL OR servido=1) AND telegram_chat_id IS NULL AND wa_cus IS NOT NULL ORDER BY id").all();
db.close();
const t0 = new Date('2026-08-17T10:00:00-03:00').getTime();
let i = 0, ok = 0, fail = 0;
for (const u of users) {
  const primer = String(u.nombre).trim().split(/\s+/)[0];
  const cuando = new Date(t0 + i * 15 * 60 * 1000).toISOString();
  const texto = `¡Hola ${primer}! Te cuento algo útil: ahora también podés hablarme por Telegram — misma Maria, me acuerdo de todo igual. Sirve como respaldo si WhatsApp anda mal (como pasó hace unas semanas) y es más cómodo para audios y archivos. Vincularte toma un minuto: entrá a t.me/MariaPaezAI_bot y tocá "compartir mi número". Listo. Si preferís seguir solo por acá, todo bien igual 🙂`;
  try {
    const r = await fetch(`http://127.0.0.1:${process.env.CAMP_PORT}/accion`, {
      method: 'POST',
      headers: { 'x-intensa-secret': process.env.CAMP_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: 1, accion: { tipo: 'programar_mensaje', cuando, canal: 'whatsapp', destino: u.wa_cus, texto }, canalOrigen: 'whatsapp' }),
    }).then(x => x.json());
    if (r && !r.error) { ok++; console.log(`✔ ${u.nombre} → ${cuando}`); }
    else { fail++; console.log(`✗ ${u.nombre}: ${JSON.stringify(r).slice(0, 140)}`); }
  } catch (e) { fail++; console.log(`✗ ${u.nombre}: ${e.message}`); }
  i++;
}
console.log(`RESULTADO: ${ok} programados, ${fail} fallos`);
NODE
node /tmp/campana-tg.mjs
rm -f /tmp/campana-tg.mjs
echo LISTO
