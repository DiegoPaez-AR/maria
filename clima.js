// clima.js — pronóstico del día vía Open-Meteo (gratis, sin API key).
//
// Dos endpoints, ambos públicos y sin autenticación:
//   - geocoding-api.open-meteo.com/v1/search  → ciudad (texto) a lat/lon
//   - api.open-meteo.com/v1/forecast          → pronóstico diario por lat/lon
//
// El morning-brief cachea el lat/lon resuelto en usuarios.lat/lon para no
// geocodificar en cada corrida; el forecast sí se pide cada día.

const TIMEOUT_MS = Number(process.env.CLIMA_TIMEOUT_MS || 8000);

async function _fetchJson(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'maria-secretaria/1.0 (+https://intensa.io)' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

// Ciudad (texto libre) → { lat, lon, nombre, pais } usando el geocoder de
// Open-Meteo. Devuelve null si no hay match.
async function geocodificar(ciudad) {
  const full = String(ciudad || '').trim();
  if (!full) return null;
  // El geocoder de Open-Meteo busca por NOMBRE de lugar: "Ciudad, PAIS"
  // devuelve 0 resultados. Mandamos solo la primera parte (la ciudad) y, si
  // el texto traía un pais ("Cordoba, AR"), lo usamos para desambiguar entre
  // homonimos (ej. Cordoba AR vs Cordoba ES).
  const parts = full.split(',').map(x => x.trim()).filter(Boolean);
  const name = parts[0] || full;
  const paisHint = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null;
  const url = `https://geocoding-api.open-meteo.com/v1/search`
            + `?name=${encodeURIComponent(name)}&count=10&language=es&format=json`;
  const data = await _fetchJson(url);
  const results = (data && Array.isArray(data.results)) ? data.results : [];
  if (!results.length) return null;
  let hit = results[0];
  if (paisHint) {
    const m = results.find(r => String(r.country_code || '').toUpperCase() === paisHint);
    if (m) hit = m;
  }
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    nombre: hit.name,
    pais: hit.country_code || hit.country || null,
    tz: hit.timezone || null,
  };
}

// Códigos WMO → [emoji, descripción en español].
const WMO = {
  0:  ['☀️', 'despejado'],
  1:  ['🌤️', 'mayormente despejado'],
  2:  ['⛅', 'parcialmente nublado'],
  3:  ['☁️', 'nublado'],
  45: ['🌫️', 'niebla'],
  48: ['🌫️', 'niebla con escarcha'],
  51: ['🌦️', 'llovizna leve'],
  53: ['🌦️', 'llovizna'],
  55: ['🌦️', 'llovizna intensa'],
  56: ['🌦️', 'llovizna helada'],
  57: ['🌦️', 'llovizna helada'],
  61: ['🌧️', 'lluvia leve'],
  63: ['🌧️', 'lluvia'],
  65: ['🌧️', 'lluvia fuerte'],
  66: ['🌧️', 'lluvia helada'],
  67: ['🌧️', 'lluvia helada fuerte'],
  71: ['🌨️', 'nieve leve'],
  73: ['🌨️', 'nieve'],
  75: ['🌨️', 'nieve fuerte'],
  77: ['🌨️', 'granizo de nieve'],
  80: ['🌦️', 'chaparrones'],
  81: ['🌧️', 'chaparrones'],
  82: ['⛈️', 'chaparrones fuertes'],
  85: ['🌨️', 'chaparrones de nieve'],
  86: ['🌨️', 'chaparrones de nieve fuertes'],
  95: ['⛈️', 'tormenta'],
  96: ['⛈️', 'tormenta con granizo'],
  99: ['⛈️', 'tormenta fuerte con granizo'],
};

function _describir(code) {
  return WMO[code] || ['🌡️', 'condiciones variables'];
}

// lat/lon + tz → pronóstico del día: { emoji, desc, min, max, probLluvia }.
// Devuelve null si la API no trae datos.
async function pronosticoHoy(lat, lon, tz) {
  if (lat == null || lon == null) return null;
  const url = `https://api.open-meteo.com/v1/forecast`
            + `?latitude=${lat}&longitude=${lon}`
            + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
            + `&timezone=${encodeURIComponent(tz || 'America/Argentina/Buenos_Aires')}`
            + `&forecast_days=1`;
  const data = await _fetchJson(url);
  const d = data && data.daily;
  if (!d || !Array.isArray(d.time) || !d.time.length) return null;
  const [emoji, desc] = _describir(d.weather_code && d.weather_code[0]);
  const _wmoCode = (d.weather_code && d.weather_code[0]);
  const max = d.temperature_2m_max && d.temperature_2m_max[0];
  const min = d.temperature_2m_min && d.temperature_2m_min[0];
  const prob = d.precipitation_probability_max && d.precipitation_probability_max[0];
  return {
    emoji,
    code: _wmoCode,
    desc,
    max: (max == null ? null : Math.round(max)),
    min: (min == null ? null : Math.round(min)),
    probLluvia: (prob == null ? null : prob),
  };
}

module.exports = { geocodificar, pronosticoHoy };
