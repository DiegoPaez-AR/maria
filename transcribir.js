// transcribir.js — wrapper sobre whisper.cpp para transcribir audios de WhatsApp

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const WHISPER_BIN     = process.env.WHISPER_BIN     || '/root/whisper.cpp/build/bin/whisper-cli';
const WHISPER_MODEL   = process.env.WHISPER_MODEL   || '/root/whisper.cpp/models/ggml-base.bin';
const WHISPER_LANG    = process.env.WHISPER_LANG    || 'es';
const WHISPER_THREADS = process.env.WHISPER_THREADS || '4';

function run(cmd, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const to = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`Timeout ${timeoutMs}ms ejecutando ${cmd}`));
    }, timeoutMs);
    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', err => { clearTimeout(to); reject(err); });
    p.on('close', code => { clearTimeout(to); resolve({ code, stdout, stderr }); });
  });
}

async function convertirAWav(inputPath, outputPath) {
  const { code, stderr } = await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', inputPath,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
    outputPath,
  ]);
  if (code !== 0) throw new Error(`ffmpeg falló (${code}): ${stderr.trim()}`);
}

async function transcribirWav(wavPath) {
  const args = [
    '-m', WHISPER_MODEL, '-f', wavPath,
    '-l', WHISPER_LANG, '-t', String(WHISPER_THREADS),
    '--output-txt', '--no-prints',
  ];
  const { code, stdout, stderr } = await run(WHISPER_BIN, args, { timeoutMs: 180000 });
  if (code !== 0) throw new Error(`whisper-cli falló (${code}): ${stderr.trim() || stdout.trim()}`);
  const txtPath = `${wavPath}.txt`;
  if (!fs.existsSync(txtPath)) return stdout.trim();
  const texto = fs.readFileSync(txtPath, 'utf8').trim();
  try { fs.unlinkSync(txtPath); } catch {}
  return texto;
}

async function transcribirArchivo(inputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`No existe: ${inputPath}`);
  const tmpWav = path.join(os.tmpdir(), `maria-${crypto.randomBytes(6).toString('hex')}.wav`);
  try {
    await convertirAWav(inputPath, tmpWav);
    return await transcribirWav(tmpWav);
  } finally {
    try { fs.unlinkSync(tmpWav); } catch {}
  }
}

async function transcribirBuffer(buffer, extension = 'ogg') {
  const tmpIn = path.join(os.tmpdir(), `maria-${crypto.randomBytes(6).toString('hex')}.${extension}`);
  fs.writeFileSync(tmpIn, buffer);
  try { return await transcribirArchivo(tmpIn); }
  finally { try { fs.unlinkSync(tmpIn); } catch {} }
}

async function transcribirAudio(media) {
  if (!media || !media.data) throw new Error('transcribirAudio: media vacío');
  const buf = Buffer.from(media.data, 'base64');
  const ext = (media.mimetype || '').includes('mpeg') ? 'mp3'
            : (media.mimetype || '').includes('mp4')  ? 'm4a'
            : 'ogg';
  return await transcribirBuffer(buf, ext);
}

function verificarDependencias() {
  const problemas = [];
  if (!fs.existsSync(WHISPER_BIN))   problemas.push(`whisper-cli no encontrado en ${WHISPER_BIN}`);
  if (!fs.existsSync(WHISPER_MODEL)) problemas.push(`modelo whisper no encontrado en ${WHISPER_MODEL}`);
  return problemas;
}

module.exports = { transcribirAudio, transcribirBuffer, transcribirArchivo, verificarDependencias };
