// bienvenida-loop.js — detecta usuarios nuevos (bienvenida_enviada=0) y manda
// el primer WA personalizado por provider. Marca el flag al enviar.

const mem = require('./memory');
const usuarios = require('./usuarios');

const CHECK_MS = 30_000;

const BIENVENIDA_TEMPLATES = {
  ninguno: (nombre) =>
`Hola ${nombre}, soy María, tu secretaria personal 👋

Tu suscripción está activa con prueba gratuita de 7 días. Por ahora elegiste empezar sin calendario integrado — está perfecto, podemos arrancar igual.

Te puedo ayudar con: tomar nota de pendientes y recordártelos, coordinar con tus contactos por WhatsApp o email, leer audios/PDFs/imágenes que me mandes, y mucho más.

Cuando quieras conectar un calendario (Google, Outlook o iCloud), decímelo y te paso los pasos.

Vivo en este chat las 24hs.`,

  google: (nombre) =>
`Hola ${nombre}, soy María, tu secretaria personal 👋

Tu suscripción está activa con prueba gratuita de 7 días. Para empezar necesito conectar tu Google Calendar.

¿Me confirmás el email de tu cuenta de Google? Te paso el flujo de conexión apenas lo tenga.

Cualquier cosa, escribime — vivo en este chat las 24hs.`,

  microsoft: (nombre) =>
`Hola ${nombre}, soy María, tu secretaria personal 👋

Tu suscripción está activa con prueba gratuita de 7 días. Para empezar necesito conectar tu Outlook / Office 365.

Te voy a mandar un link de autorización en un momento. Cuando lo abras y me autorices, quedamos conectados.

Cualquier cosa, escribime — vivo en este chat las 24hs.`,

  caldav: (nombre) =>
`Hola ${nombre}, soy María, tu secretaria personal 👋

Tu suscripción está activa con prueba gratuita de 7 días. Para empezar necesito conectar tu calendario de iCloud / Fastmail / Yahoo.

Para eso necesitás una *app-specific password* — te paso los pasos exactos en el próximo mensaje.

Cualquier cosa, escribime — vivo en este chat las 24hs.`,
};

function _renderBienvenida(usuario) {
  // Si el user eligió "sin calendario" en signup, calendar_acceso=='none' y
  // queremos el template específico que NO pregunta por provider.
  const key = usuario.calendar_acceso === 'none' ? 'ninguno' : usuario.calendar_provider;
  const tpl = BIENVENIDA_TEMPLATES[key] || BIENVENIDA_TEMPLATES.google;
  return tpl(usuario.nombre);
}

async function _tick({ waClient }) {
  if (!waClient) return;
  const nuevos = usuarios.listarActivos().filter(u => u.bienvenida_enviada === 0);
  if (!nuevos.length) return;
  for (const u of nuevos) {
    const dest = u.wa_lid || u.wa_cus || null;
    if (!dest) {
      console.warn(`[bienvenida] usuario ${u.nombre} (id=${u.id}) sin destino WA — skip`);
      continue;
    }
    const texto = _renderBienvenida(u);
    try {
      await waClient.sendMessage(dest, texto);
      mem.log({
        usuarioId: u.id,
        canal: 'whatsapp', direccion: 'saliente',
        para: dest, cuerpo: texto,
        metadata: { tipo: 'bienvenida_inicial' },
      });
      mem.db.prepare(`UPDATE usuarios SET bienvenida_enviada=1 WHERE id=?`).run(u.id);
      console.log(`[bienvenida] WA enviado a ${u.nombre} (id=${u.id}) → ${dest}`);
    } catch (err) {
      console.error(`[bienvenida] error mandando a ${u.nombre}:`, err.message);
    }
  }
}

function iniciarBienvenida({ waClient, intervaloMs = CHECK_MS } = {}) {
  const tick = () => _tick({ waClient }).catch(err => console.error('[bienvenida] tick error:', err.message));
  return setInterval(tick, intervaloMs);
}

module.exports = { iniciarBienvenida };
