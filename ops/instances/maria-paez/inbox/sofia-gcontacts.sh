#!/bin/bash
cd /root/secretaria
set -a; . config/instances/sofia-bruscoli.conf; . config/secrets.conf 2>/dev/null; set +a
echo "── Diego como contacto de Noelia en la libreta de Sofia ──"
timeout 60 node -e '
const mem = require("./memory");
const gc = require("./google-contacts");
(async () => {
  const c = mem.upsertContacto({ usuarioId: 2, nombre: "Diego Paez", whatsapp: "541132317896", email: "diego@paez.is", notas: "Socio / referente técnico de Sofia", visibilidad: "privada" });
  console.log("  libreta:", JSON.stringify({ id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, email: c.email }));
  const r = await gc.sincronizarContacto(c, { dueno: "Noelia Bruscoli" });
  console.log("  Google Contacts:", JSON.stringify(r));
})().catch(e => console.log("  ERROR:", e.message));
'
echo "── espero el arranque con el código nuevo ──"
sleep 75
grep -h "gcontacts" /root/.pm2/logs/sofia-bruscoli-out.log /root/.pm2/logs/maria-paez-out.log | tail -8 | cut -c1-160
echo "── mapping en sofia ──"
sqlite3 /root/secretaria/state/sofia-bruscoli/db/maria.sqlite "select contacto_id,resource_name,actualizado from gcontacts_sync"
echo LISTO
