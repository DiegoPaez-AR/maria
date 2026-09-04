#!/bin/bash
cd /root/secretaria
set -a; . config/instances/sofia-bruscoli.conf; . config/secrets.conf 2>/dev/null; set +a
timeout 60 node -e '
const g = require("./google");
(async () => {
  const cal = await g.getMariaCalendarId();
  const ev = await g.listarEventosProximos({ dias: 1, max: 20, calendarId: cal });
  for (const e of ev) console.log(" -", e.id, "|", e.inicio || e.start, "|", e.titulo || e.summary, "|", (e.attendees||[]).join(","), "|", e.meetLink || e.meet || "");
})().catch(e => console.log("ERROR", e.message));
'
sqlite3 /root/secretaria/state/sofia-bruscoli/db/maria.sqlite "select datetime(timestamp,'-3 hours'), substr(cuerpo,1,220) from eventos where canal='calendar' and date(timestamp,'-3 hours')='2026-09-04'"
echo LISTO
