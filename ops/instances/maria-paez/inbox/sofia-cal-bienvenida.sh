#!/bin/bash
cd /root/secretaria
set -a; . config/instances/sofia-bruscoli.conf; . config/secrets.conf 2>/dev/null; set +a
DB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
sed -i '0,/^OWNER_SERVIDO=1$/!{/^OWNER_SERVIDO=1$/d}' config/instances/sofia-bruscoli.conf
echo "── calendar de Noelia: read ──"
sqlite3 "$DB" "update usuarios set calendar_id='nbruscoli@luminaconsultora.com', calendar_acceso='read' where id=2"
sqlite3 "$DB" "select id,nombre,rol,calendar_id,calendar_acceso from usuarios where id=2"
timeout 60 node -e '
const g = require("./google");
(async () => {
  const ev = await g.listarEventosProximos({ dias: 7, max: 5, calendarId: "nbruscoli@luminaconsultora.com" });
  console.log("  eventos próximos 7 días:", ev.length);
  ev.forEach(e => console.log("   -", (e.inicio||e.start||"").toString().slice(0,16), "|", e.titulo||e.summary||"(sin título)"));
})().catch(e => console.log("  ERROR:", e.message));
'
echo "── bienvenida ──"
timeout 60 node -e '
const g = require("./google");
const texto = `Hola Noelia, ¿cómo estás? Soy Sofia, tu nueva asistente. Voy a manejar tu agenda, coordinar reuniones con quien me digas, hacer seguimiento de lo que quede pendiente, recordarte cosas y mandarte cada mañana un resumen de tu día.

CÓMO HABLARME
Lo más cómodo es por Telegram: entrá a https://t.me/SofiaBruscoliAI_bot, tocá "Iniciar" y después "Compartir mi número" — con eso te reconozco y ya me podés escribir o mandarme audios. Si preferís, también me podés escribir a este mail; funciona igual. Por WhatsApp no atiendo a mis usuarios (solo lo uso para coordinar con terceros), así que si me escribís por ahí te voy a responder por Telegram o por acá.

TU CALENDARIO
Como estamos en la misma organización, ya puedo VER tu calendario: sé cuándo estás ocupada y cuándo libre, así que puedo proponer horarios sin superponerte nada. Lo que no puedo, por ahora, es escribir directamente en él. En la práctica funciona así: cuando coordino una reunión, la creo en mi calendario y te invito; te llega la invitación, la aceptás y queda en tu agenda. Si hay que mover o cancelar algo que armé yo, lo hago sin problema.

Si querés que trabaje directo sobre tu calendario (que las reuniones aparezcan como tuyas, con tu Meet, y que pueda mover o cancelar cualquier evento tuyo), compartilo con sofia@luminaconsultora.com con el permiso "Hacer cambios en eventos": en Google Calendar → Configuración del calendario → Compartir con determinadas personas. Cuando lo hagas, avisame y listo. No es obligatorio; con lo que hay ya puedo arrancar.

Cualquier duda, acá estoy.

Sofia`;
g.enviarEmail({ to: "nbruscoli@luminaconsultora.com", asunto: "Hola Noelia, soy Sofia, tu asistente", texto })
  .then(r => console.log("  enviado:", JSON.stringify(r).slice(0,120)))
  .catch(e => console.log("  ERROR:", e.message));
'
echo "── reload (calendar_id nuevo) ──"
timeout 90 pm2 reload ecosystem.config.js --only sofia-bruscoli --update-env >/dev/null 2>&1 && echo "  reload OK"
echo LISTO
