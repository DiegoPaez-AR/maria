// ecosystem.config.js — config de pm2 multi-instance.
//
// Lee config/instances/*.conf y arma un app pm2 por cada uno. Cada .conf
// contiene las env vars de identidad/paths/tuning de la instancia (formato
// KEY=VALUE, # para comentarios). El ASISTENTE_SLUG dentro del .conf es el
// que da nombre al proceso pm2 ('maria-paez', 'juan-sanchez', etc.).
//
// Deploy:
//   pm2 delete all || true
//   pm2 start ecosystem.config.js
//   pm2 save
//
// Para sumar una instancia: agregar config/instances/<slug>.conf y reload:
//   pm2 reload ecosystem.config.js  (lanza la nueva sin tocar las viejas)

const fs   = require('fs');
const path = require('path');

const ROOT          = __dirname;
const INSTANCES_DIR = path.join(ROOT, 'config', 'instances');

function _parseConf(file) {
  const env = {};
  const txt = fs.readFileSync(file, 'utf8');
  for (let line of txt.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    // Quitar comillas si están: "valor con espacios" → valor con espacios
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

function _confs() {
  if (!fs.existsSync(INSTANCES_DIR)) return [];
  return fs.readdirSync(INSTANCES_DIR)
    .filter(f => f.endsWith('.conf'))
    .map(f => path.join(INSTANCES_DIR, f))
    .sort();
}

const confs = _confs();
if (!confs.length) {
  // Fallback de compat: si todavía no hay confs, levantamos la app
  // legacy 'maria' apuntando al cwd con env mínimo.
  module.exports = {
    apps: [{
      name: 'maria',
      script: 'index.js',
      cwd: ROOT,
      autorestart: true,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      env: { NODE_ENV: 'production', TZ: 'America/Argentina/Buenos_Aires' },
    }],
  };
} else {
  module.exports = {
    apps: confs.map(file => {
      const env = _parseConf(file);
      const slug = env.ASISTENTE_SLUG || path.basename(file, '.conf');
      return {
        name: slug,
        script: 'index.js',
        cwd: ROOT,
        autorestart: true,
        max_memory_restart: '1G',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        merge_logs: true,
        env: {
          NODE_ENV: 'production',
          TZ: env.ASISTENTE_TZ || 'America/Argentina/Buenos_Aires',
          ...env,
        },
      };
    }),
  };
}
