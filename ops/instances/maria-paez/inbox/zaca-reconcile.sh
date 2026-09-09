#!/bin/bash
cd /root/secretaria
echo "── crontab: ¿reconcile programado? ──"
crontab -l 2>/dev/null | grep -i "gcontacts\|reconcile" || echo "  (no está en crontab)"
grep -rl "gcontacts-reconcile" /etc/cron.d/ 2>/dev/null
echo "── rename Saka → Zaca (Sofia) ──"
set -a; . config/instances/sofia-bruscoli.conf; . config/secrets.conf 2>/dev/null; set +a
timeout 60 node -e '
const mem = require("./memory"); const gc = require("./google-contacts");
(async () => {
  const c0 = mem.db.prepare("select * from contactos where id=12").get();
  console.log("  antes:", c0.nombre, "|", c0.notas);
  mem.db.prepare("update contactos set nombre=?, notas=?, actualizado=CURRENT_TIMESTAMP where id=12").run("Zaca", "Amigo de Noelia Bruscoli (antes cargado como \"Saka\"; corregido 9/9). Prefiere trato formal.");
  mem.log({ usuarioId: 2, canal: "sistema", direccion: "interno", cuerpo: "upsert_contacto: ficha \"Saka\" (#12) renombrada a \"Zaca\" (corrección manual del operador)", metadata: { tipo: "contacto_renombrado", contacto_id: 12, antes: "Saka", despues: "Zaca" } });
  const c = mem.db.prepare("select * from contactos where id=12").get();
  console.log("  Google:", JSON.stringify(await gc.sincronizarContacto(c, { dueno: "Noelia Bruscoli" })));
})().catch(e => console.log("  ERROR", e.message));
'
echo "── reconcile de las dos instancias (con motivos) ──"
bash ops/scripts/gcontacts-reconcile.sh
for S in maria-paez sofia-bruscoli; do echo "[$S]"; tail -30 /root/secretaria/state/$S/gcontacts-reconcile.log | grep -E "reconcile|FALLÓ" | tail -12 | cut -c1-170; done
echo "── libreta de Maria vs mapping ──"
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "select count(*) contactos, sum(g.resource_name is null) sin_sync from contactos c left join gcontacts_sync g on g.contacto_id=c.id"
echo LISTO
