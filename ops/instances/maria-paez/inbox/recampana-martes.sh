#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
export RC_SECRET="$SECRET" RC_PORT="$PORT"
cat > /tmp/recamp.mjs <<'NODE'
import Database from "/root/secretaria/node_modules/better-sqlite3/lib/index.js";
const db = new Database(process.env.MARIA_DB, { readonly: true });
const ids = [7,8,9,10,12,13,16,18,19,20];
const users = db.prepare(`SELECT id,nombre,wa_cus,telegram_chat_id FROM usuarios WHERE id IN (${ids.join(",")}) AND activo=1`).all();
db.close();
const t0 = new Date("2026-08-18T10:00:00-03:00").getTime();
let i = 0, ok = 0;
for (const u of users) {
  if (u.telegram_chat_id) { console.log(`~ ${u.nombre} ya se vinculó — skip`); continue; }
  const primer = String(u.nombre).trim().split(/\s+/)[0];
  const cuando = new Date(t0 + i * 45 * 60 * 1000).toISOString();
  const texto = `¡Hola ${primer}! Te cuento algo útil: ahora también podés hablarme por Telegram — misma Maria, me acuerdo de todo igual. Sirve como respaldo si WhatsApp anda mal (como pasó hace unas semanas) y es más cómodo para audios y archivos. Vincularte toma un minuto: entrá a t.me/MariaPaezAI_bot y tocá "compartir mi número". Listo. Si preferís seguir solo por acá, todo bien igual 🙂`;
  const r = await fetch(`http://127.0.0.1:${process.env.RC_PORT}/accion`, {
    method: "POST",
    headers: { "x-intensa-secret": process.env.RC_SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ usuarioId: 1, accion: { tipo: "programar_mensaje", cuando, canal: "whatsapp", destino: u.wa_cus, texto }, canalOrigen: "whatsapp" }),
  }).then(x => x.json()).catch(e => ({ error: e.message }));
  if (r && !r.error) { ok++; console.log(`✔ ${u.nombre} → ${cuando}`); } else console.log(`✗ ${u.nombre}: ${JSON.stringify(r).slice(0,100)}`);
  i++;
}
console.log(`RE-CAMPAÑA: ${ok} programados para martes 18/8`);
NODE
node /tmp/recamp.mjs
rm -f /tmp/recamp.mjs
echo LISTO
