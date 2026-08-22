// media-store.js — archivos recibidos/publicables de Maria (2026-08-17).
//
// GUARDAR: los adjuntos que entran por WA (mbmedia) se persisten acá para
// poder reenviarlos después. PUBLICAR: enviar_archivo_wa copia el archivo a
// /var/www/intensa.io/_dl con token único y manda el LINK por WhatsApp (el
// bridge no puede adjuntar nativo). RETENCIÓN: 30 días en ambos lados, la
// poda diaria limpia (podarViejos, llamado por poda-eventos).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEDIA_DIR = process.env.MARIA_MEDIA_DIR
  || path.join(path.dirname(process.env.MARIA_DB || '/root/secretaria/state/maria-paez/db/x'), '..', 'media');
const PUB_DIR = process.env.MARIA_PUB_DIR || '/var/www/intensa.io/_dl';
const PUB_URL = process.env.MARIA_PUB_URL || 'https://intensa.io/_dl';
const RETENCION_DIAS = Number(process.env.MARIA_MEDIA_RETENCION_DIAS || 30);

function _asegurarDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch { /* noop */ } }

/** Persiste un buffer recibido. Devuelve el id (nombre de archivo) para reenvíos. */
function guardar(buffer, nombreOriginal) {
  _asegurarDir(MEDIA_DIR);
  const ext = (String(nombreOriginal || '').match(/\.(\w{1,5})$/) || [])[1] || 'bin';
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, id), buffer);
  return id;
}

/** Resuelve un id a path absoluto (anti path-traversal). null si no existe. */
function resolver(id) {
  const limpio = path.basename(String(id || ''));
  if (!limpio || limpio.startsWith('.')) return null;
  const abs = path.join(MEDIA_DIR, limpio);
  return fs.existsSync(abs) ? abs : null;
}

/** Publica un archivo (por id de media o path absoluto) → URL con token. */
function publicar(idOPath) {
  const abs = idOPath.startsWith('/') ? path.resolve(idOPath) : resolver(idOPath);
  // 🔴 SEGURIDAD (auditoría 22/8): la rama "path absoluto" salteaba el guard
  // anti-traversal → enviar_archivo_wa con "/root/secretaria/config/secrets.conf"
  // publicaba el archivo a la web ANTES de validar destinatario. Solo se puede
  // publicar lo que está en MEDIA_DIR o en los adjuntos temporales del turno.
  const _base = path.resolve(MEDIA_DIR);
  if (!abs || !(abs.startsWith(_base + path.sep) || abs.startsWith('/tmp/maria-attach-'))) {
    throw new Error(`media-store: "${String(idOPath).slice(0, 60)}" no es un archivo publicable (solo adjuntos guardados)`);
  }
  if (!fs.existsSync(abs)) throw new Error(`media-store: no existe "${idOPath}"`);
  _asegurarDir(PUB_DIR);
  const ext = (abs.match(/\.(\w{1,5})$/) || [])[1] || 'bin';
  const token = crypto.randomBytes(8).toString('hex');
  const nombre = `m-${token}.${ext}`;
  fs.copyFileSync(abs, path.join(PUB_DIR, nombre));
  try { fs.chmodSync(path.join(PUB_DIR, nombre), 0o644); } catch { /* noop */ }
  return `${PUB_URL}/${nombre}`;
}

/** Poda: borra media guardada y links publicados con más de RETENCION_DIAS. */
function podarViejos() {
  const corte = Date.now() - RETENCION_DIAS * 24 * 3600 * 1000;
  let n = 0;
  for (const dir of [MEDIA_DIR, PUB_DIR]) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      // en PUB_DIR solo tocamos lo nuestro: links m-* y APKs viejos mb-*
      if (dir === PUB_DIR && !/^m-|^mb-/.test(f)) continue;
      if (dir === PUB_DIR && f.endsWith('.json')) continue;   // latest.json vive
      const abs = path.join(dir, f);
      try {
        const st = fs.statSync(abs);
        if (!st.isFile() || st.mtimeMs >= corte) continue;
        // no borrar el APK vigente (el que apunta latest.json)
        if (/^mb-.*\.apk$/.test(f)) {
          try {
            const latest = JSON.parse(fs.readFileSync(path.join(PUB_DIR, 'mariabridge-latest.json'), 'utf8'));
            if (String(latest.url || '').endsWith(f)) continue;
          } catch { /* sin latest → podar igual */ }
        }
        fs.unlinkSync(abs); n++;
      } catch { /* noop */ }
    }
  }
  if (n) console.log(`[media-store] poda: ${n} archivo(s) de +${RETENCION_DIAS}d borrados`);
  return n;
}

module.exports = { guardar, resolver, publicar, podarViejos, MEDIA_DIR };
