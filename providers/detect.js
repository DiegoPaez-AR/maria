// providers/detect.js — detección de calendar provider por dominio del email.
//
// Dado el email de un user, devuelve qué provider de calendar usa
// (google / microsoft / caldav) y, para CalDAV, qué subKind + server_url
// inicial. Sirve para que el flow de onboarding sepa qué pasos darle
// al user nuevo sin que tenga que explicarlo.
//
// Returns:
//   { kind: 'google',   subKind: null,        server_url: null,  bloqueado: false }
//   { kind: 'microsoft',subKind: null,        server_url: null,  bloqueado: true  } (Fase 2 todavía)
//   { kind: 'caldav',   subKind: 'icloud',    server_url: '...', bloqueado: false }
//   null  → dominio desconocido, el LLM debe preguntarle al user
//
// Si el email es null/vacío, devuelve null (el LLM tiene que pedir email primero).

const CALDAV_SERVERS = {
  icloud:   'https://caldav.icloud.com/',
  yahoo:    'https://caldav.calendar.yahoo.com/',
  fastmail: 'https://caldav.fastmail.com/dav/',
};

const RULES = [
  // Google
  { kind: 'google',    test: d => /^(gmail|googlemail)\.com$/i.test(d) },
  // Microsoft Graph (activo desde Fase 2)
  { kind: 'microsoft',
    test: d => /^(outlook\.[a-z.]+|hotmail\.[a-z.]+|live\.[a-z.]+|msn\.com|office365\.com)$/i.test(d) },
  // CalDAV — iCloud
  { kind: 'caldav', subKind: 'icloud', server_url: CALDAV_SERVERS.icloud,
    test: d => /^(icloud\.com|me\.com|mac\.com)$/i.test(d) },
  // CalDAV — Yahoo
  { kind: 'caldav', subKind: 'yahoo', server_url: CALDAV_SERVERS.yahoo,
    test: d => /^(yahoo\.[a-z.]+|ymail\.com|rocketmail\.com)$/i.test(d) },
  // CalDAV — Fastmail
  { kind: 'caldav', subKind: 'fastmail', server_url: CALDAV_SERVERS.fastmail,
    test: d => /^(fastmail\.(com|fm|cn|to)|messagingengine\.com)$/i.test(d) },
];

/**
 * Extrae el dominio del email, normalizado a lowercase. Tolera padding
 * y mayúsculas. Devuelve null si el input no parece un email.
 */
function _dominio(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.indexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Detecta el calendar provider del usuario en base a su email.
 * Devuelve null si el dominio no matchea ninguna regla conocida
 * (el LLM debe preguntarle).
 */
function detectarProvider(email) {
  const dominio = _dominio(email);
  if (!dominio) return null;
  for (const rule of RULES) {
    if (rule.test(dominio)) {
      return {
        kind: rule.kind,
        subKind: rule.subKind || null,
        server_url: rule.server_url || null,
        bloqueado: !!rule.bloqueado,
      };
    }
  }
  return null;
}

/**
 * Texto humano descriptivo del provider detectado, listo para meter
 * en el prompt. Si null, devuelve string vacío.
 */
function descripcionProvider(det) {
  if (!det) return '';
  if (det.kind === 'google') return 'Google (Gmail)';
  if (det.kind === 'microsoft') return 'Microsoft (Outlook / Office 365)';
  if (det.kind === 'caldav') {
    const sub = det.subKind ? det.subKind.charAt(0).toUpperCase() + det.subKind.slice(1) : 'CalDAV';
    return `${sub} (CalDAV)`;
  }
  return det.kind;
}

module.exports = {
  detectarProvider,
  descripcionProvider,
  CALDAV_SERVERS,
};
