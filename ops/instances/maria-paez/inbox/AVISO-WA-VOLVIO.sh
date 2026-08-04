#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 6
set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node - <<'NODE'
(async () => {
  const usuarios = require('/root/secretaria/usuarios');
  const mem = require('/root/secretaria/memory');
  const g = require('/root/secretaria/google');
  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  const es = (n) => ({
    asunto: 'Maria — ¡WhatsApp está de vuelta!',
    texto: `¡Hola ${n}! Buenas noticias: mi WhatsApp volvió a funcionar 🎉 Ya podés escribirme ahí como siempre, al mismo número.\n\nUn solo detalle: por ahora no puedo escuchar audios ni ver fotos que me mandes por WhatsApp — si necesitás pasarme algo así, escribímelo en texto (o mandámelo por Telegram, que por ahí sí lo proceso).\n\n¡Gracias por la paciencia de estas semanas!\n— Maria`,
  });
  const en = (n) => ({
    asunto: 'Maria — WhatsApp is back!',
    texto: `Hi ${n}! Good news: my WhatsApp is working again 🎉 You can message me there as always, same number.\n\nOne detail: for now I can't listen to audios or see photos sent via WhatsApp — if you need to share something like that, write it as text (or send it via Telegram, where I can process it).\n\nThanks for your patience these weeks!\n— Maria`,
  });
  const lista = usuarios.listarServidos().filter(u => u.rol !== 'owner');
  let ok = 0, fail = 0;
  for (const u of lista) {
    const t = (u.idioma === 'en' ? en : es)(u.nombre.split(' ')[0]);
    try {
      if (u.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
        const { enviarTG } = require('/root/secretaria/telegram-handler');
        await enviarTG(u.telegram_chat_id, t.texto);
        mem.log({ usuarioId: u.id, canal: 'telegram', direccion: 'saliente', de: 'telegram:' + u.telegram_chat_id, nombre: u.nombre, cuerpo: t.texto, metadata: { tipo: 'aviso_wa_volvio' } });
      } else if (u.email) {
        await g.enviarEmail({ to: u.email, asunto: t.asunto, texto: t.texto });
        mem.log({ usuarioId: u.id, canal: 'gmail', direccion: 'saliente', de: u.email, nombre: u.nombre, asunto: t.asunto, cuerpo: t.texto, metadata: { tipo: 'aviso_wa_volvio' } });
      } else { console.log('- sin canal:', u.nombre); continue; }
      ok++; console.log('✓', u.nombre, u.telegram_chat_id ? '(tg)' : '(email)');
    } catch (e) { fail++; console.log('✗', u.nombre, ':', e.message.slice(0, 60)); }
    await dormir(1500);
  }
  console.log(`aviso WA-volvió: ${ok} ok, ${fail} fallidos de ${lista.length}`);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
NODE
