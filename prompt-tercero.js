// prompt-tercero.js — poda del prompt para turnos de TERCERO (2026-08-28).
// Módulo SIN dependencias a propósito: los tests del canary corren sin env
// (sin MARIA_DB, sin ASISTENTE_FROM_EMAIL) y requerir prompt-builder arrastra
// google/memory que explotan al cargarse. La lección quedó cara: el primer
// deploy de esto falló el canary exactamente por eso.

// Acciones que un turno de TERCERO no puede usar (gestión de usuarios,
// onboarding de calendario, administración). Sacarlas del catálogo no las
// deshabilita — el executor y sus gates siguen intactos — solo deja de
// pagarse su descripción en cada mensajito de un tercero.
const ACCIONES_SOLO_USUARIO = [
  'crear_usuario', 'actualizar_usuario', 'borrar_usuario',
  'set_calendar_acceso', 'configurar_brief', 'configurar_ubicacion',
  'configurar_caldav', 'iniciar_microsoft_auth', 'configurar_microsoft',
  'vincular_telegram', 'confirmar_prospecto_pendiente', 'rechazar_prospecto_pendiente',
  'buscar_slots_comunes', 'cambiar_visibilidad_contacto', 'set_cumple_contacto',
];

function podarPromptTercero(system, user) {
  let s = system, u = user;
  // 1) catálogo: fuera las acciones de administración/onboarding
  for (const tipo of ACCIONES_SOLO_USUARIO) {
    const re = new RegExp('\\n  \\{ "tipo": "' + tipo + '"[\\s\\S]*?(?=\\n  \\{ "tipo": "|\\n\\n)');
    s = s.replace(re, '');
  }
  // 2) user: el bloque de prospectos + onboarding (solo aparece si el usuario
  //    del flow es el owner; un tercero no confirma prospectos ni se onboardea)
  u = u.replace(/\n━+\n\[PROSPECTOS PENDIENTES DE CONFIRMACIÓN[\s\S]*?(?=\n━+\n\[FORMATO DE RESPUESTA)/, '\n');
  // 3) user: las tareas PERSONALES del usuario y sus consultas abiertas — un
  //    tercero no tiene por qué "ver" la lista de to-dos de Diego. Las
  //    gestiones de Maria ([TAREAS PROPIAS DE MARIA]) SÍ quedan: ahí vive la
  //    gestión en curso con este tercero.
  u = u.replace(/\[CONSULTAS ABIERTAS DE[\s\S]*?(?=\[TAREAS PROPIAS DE MARIA)/, '');
  // 4) user: programados y cumpleaños — irrelevantes para un tercero
  u = u.replace(/\n━+\n\[MENSAJES PROGRAMADOS[\s\S]*?(?=\n━+\n\[)/, '\n');
  u = u.replace(/\[CUMPLEAÑOS PRÓXIMOS\]\n[\s\S]*?(?=\n\n\[|\n━)/, '');
  return { system: s, user: u };
}


module.exports = { podarPromptTercero, ACCIONES_SOLO_USUARIO };
