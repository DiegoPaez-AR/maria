// lib/stripe.js — cliente Stripe dependency-free (sin SDK).
//   · verifyWebhook(rawBody, sigHeader, secret) → valida firma 'stripe-signature' y devuelve el evento parseado
//   · api(method, path, params)                 → request form-encoded a api.stripe.com con la STRIPE_SECRET_KEY
// Node 18+ (global fetch).

const crypto = require('crypto');

const API_BASE = 'https://api.stripe.com/v1';

// Aplana objetos/arrays anidados al formato bracket de Stripe:
//   { line_items: [{ price: 'x', quantity: 1 }] } → line_items[0][price]=x&line_items[0][quantity]=1
function _flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') _flatten(item, `${key}[${i}]`, out);
        else out.push([`${key}[${i}]`, String(item)]);
      });
    } else if (typeof v === 'object') {
      _flatten(v, key, out);
    } else {
      out.push([key, String(v)]);
    }
  }
}

function _encode(params) {
  const out = [];
  _flatten(params, '', out);
  return out.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function api(method, path, params) {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) { const e = new Error('STRIPE_SECRET_KEY no configurada'); e.status = 503; throw e; }
  const opts = { method, headers: { Authorization: `Bearer ${sk}` } };
  if (params && method.toUpperCase() !== 'GET') {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = _encode(params);
  }
  const r = await fetch(API_BASE + path, opts);
  let j = null;
  try { j = await r.json(); } catch { /* respuesta no-JSON */ }
  if (!r.ok) {
    const e = new Error(j?.error?.message || `Stripe respondió ${r.status}`);
    e.status = r.status;
    e.stripe = j?.error;
    throw e;
  }
  return j;
}

// Valida la firma del header 'stripe-signature' (formato: t=ts,v1=sig[,v1=...]).
// Reproduce stripe.webhooks.constructEvent. Devuelve el evento (objeto) o lanza.
function verifyWebhook(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!secret) { const e = new Error('STRIPE_WEBHOOK_SECRET no configurado'); e.status = 503; throw e; }
  if (!sigHeader) { const e = new Error('missing stripe-signature'); e.status = 401; throw e; }
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));

  const parts = {};
  for (const seg of String(sigHeader).split(',')) {
    const idx = seg.indexOf('=');
    if (idx < 0) continue;
    const k = seg.slice(0, idx).trim();
    const v = seg.slice(idx + 1).trim();
    (parts[k] = parts[k] || []).push(v);
  }
  const t = parts.t && parts.t[0];
  const sigs = parts.v1 || [];
  if (!t || !sigs.length) { const e = new Error('malformed signature header'); e.status = 401; throw e; }

  const signedPayload = Buffer.concat([Buffer.from(`${t}.`, 'utf8'), buf]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expBuf = Buffer.from(expected, 'utf8');
  const ok = sigs.some((s) => {
    const sBuf = Buffer.from(s, 'utf8');
    return sBuf.length === expBuf.length && crypto.timingSafeEqual(sBuf, expBuf);
  });
  if (!ok) { const e = new Error('signature mismatch'); e.status = 401; throw e; }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (Number.isFinite(age) && age > toleranceSec) {
    const e = new Error(`timestamp fuera de tolerancia (${age}s)`); e.status = 401; throw e;
  }
  return JSON.parse(buf.toString('utf8'));
}

// Unix seconds → ISO string (o null).
function unixToIso(sec) {
  if (!sec && sec !== 0) return null;
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

module.exports = { api, verifyWebhook, unixToIso, _encode };
