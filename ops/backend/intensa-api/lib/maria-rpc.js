// maria-rpc.js — HTTP client al internal-api que cada Maria expone localmente.

const http = require('http');

function _request(instance, pathStr, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: instance.host,
      port: instance.internal_port,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Intensa-Secret': instance.internal_secret,
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = buf ? JSON.parse(buf) : {}; }
        catch (e) { parsed = { raw: buf }; }
        if (res.statusCode >= 400) {
          const err = new Error(`Maria ${instance.slug} respondió ${res.statusCode}: ${parsed.error || parsed.message || buf}`);
          err.status = res.statusCode;
          err.detail = parsed;
          return reject(err);
        }
        resolve(parsed);
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Maria ${instance.slug}: timeout`));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function sendEmail(instance, { to, subject, html, text }) {
  return _request(instance, '/send-email', { to, subject, html, text });
}

async function sendWa(instance, { to, body }) {
  return _request(instance, '/send-wa', { to, body });
}

async function reloadUsuarios(instance) {
  return _request(instance, '/reload-usuarios', {});
}

async function health(instance) {
  return _request(instance, '/health', null, 5_000);
}

module.exports = { sendEmail, sendWa, reloadUsuarios, health };
