#!/bin/bash
cd /root/secretaria
DB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
echo "── libreta vs mapping ──"
sqlite3 "$DB" "select c.id, c.nombre, c.email, case when g.resource_name is null then 'SIN SYNC' else 'ok' end from contactos c left join gcontacts_sync g on g.contacto_id=c.id order by c.id"
sqlite3 "$DB" "select -u.id, u.nombre, case when g.resource_name is null then 'SIN SYNC' else 'ok' end from usuarios u left join gcontacts_sync g on g.contacto_id=-u.id where u.activo=1"
echo "── reconcile ahora para sofia (con motivos) ──"
set -a; . config/instances/sofia-bruscoli.conf; . config/secrets.conf 2>/dev/null; set +a
timeout 120 node -e '
const mem = require("./memory"); const gc = require("./google-contacts");
(async () => {
  const rows = mem.db.prepare(`SELECT c.*, u.nombre AS dueno_nombre FROM contactos c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.id`).all();
  for (const c of rows) { try { const r = await gc.sincronizarContacto(c, { dueno: c.dueno_nombre }); console.log("  ", c.nombre, JSON.stringify(r)); } catch (e) { console.log("   FALLÓ", c.nombre, e.message.slice(0,120)); } await new Promise(r=>setTimeout(r,500)); }
})();
'
echo LISTO
