#!/bin/bash
# Listar emails históricos de "shared a calendar" para diseñar el auto-accept
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a
cd /root/secretaria

echo "═══ Emails de tipo 'shared a calendar' o 'calendar access updated' ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, substr(de,1,60) AS de, substr(cuerpo,1,300) AS cuerpo_excerpt
FROM eventos
WHERE canal='gmail'
  AND (cuerpo LIKE '%shared a calendar%' OR cuerpo LIKE '%Calendar access updated%' OR cuerpo LIKE '%invited you to see all event details%' OR cuerpo LIKE '%has invited you to%')
ORDER BY id DESC LIMIT 10
"

echo ""
echo "═══ El email de Santiago del 14-may en detalle: traer cuerpo y metadata via Gmail API ═══"
# Obtener el messageId de un evento que sabemos es de share
MSG_ID=$(sqlite3 "$MARIA_DB" "
SELECT json_extract(metadata_json, '\$.messageId')
FROM eventos
WHERE canal='gmail' AND cuerpo LIKE '%Santiago Bignone shared a calendar%'
ORDER BY id ASC LIMIT 1
")
echo "messageId del primer share: $MSG_ID"

if [ -n "$MSG_ID" ] && [ "$MSG_ID" != "null" ]; then
  echo ""
  echo "═══ Cuerpo completo del email (via gmail.users.messages.get) ═══"
  timeout 30s node -e "
  (async () => {
    const g = require('./google');
    try {
      const e = await g.leerEmail('$MSG_ID');
      console.log('From:    ', e.de);
      console.log('To:      ', e.para);
      console.log('Subject: ', e.asunto);
      console.log('Body (primeros 2000c):');
      console.log((e.cuerpo || '').slice(0, 2000));
      console.log('');
      console.log('--- emails que aparecen en el body ---');
      const matches = (e.cuerpo || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [];
      const unique = [...new Set(matches)];
      unique.forEach(em => console.log('  ', em));
    } catch (err) {
      console.error('ERROR:', err.message);
    }
  })();
  "
fi

echo ""
echo "═══ Estructura de calendarList de Maria — qué calendars ya tiene ═══"
timeout 30s node -e "
(async () => {
  const g = require('./google');
  try {
    const auth = await g.autenticar();
    const cal = require('googleapis').google.calendar({version:'v3', auth});
    const r = await cal.calendarList.list({maxResults: 50});
    for (const it of r.data.items || []) {
      console.log(\`  id=\${(it.id||'').padEnd(50)} role=\${it.accessRole}\`);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  }
})();
"
