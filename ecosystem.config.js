// ecosystem.config.js — config de pm2 para Maria
//
// Cambios respecto a `pm2 start index.js --name maria`:
//   - log_date_format: prepende timestamp a cada línea de log → mejor debug.
//   - TZ: fuerza hora Argentina dentro del proceso (independiente del VPS).
//   - autorestart + max_memory_restart: protección básica.
//
// Deploy:
//   pm2 delete maria
//   pm2 start ecosystem.config.js
//   pm2 save
//
// (lo hace ops/inbox/setup-tz-and-pm2.sh la primera vez)

module.exports = {
  apps: [{
    name: 'maria',
    script: 'index.js',
    cwd: '/root/secretaria',
    autorestart: true,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    env: {
      NODE_ENV: 'production',
      TZ: 'America/Argentina/Buenos_Aires',
    },
  }],
};
