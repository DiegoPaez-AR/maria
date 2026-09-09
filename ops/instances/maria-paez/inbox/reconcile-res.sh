#!/bin/bash
cd /root/secretaria
pgrep -f gcontacts-reconcile >/dev/null && echo "todavía corriendo" || echo "terminó"
for S in maria-paez sofia-bruscoli; do echo "[$S]"; grep -E "reconcile semanal|FALLÓ" /root/secretaria/state/$S/gcontacts-reconcile.log | tail -25 | cut -c1-180; done
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "select count(*) contactos, sum(g.resource_name is null) sin_sync from contactos c left join gcontacts_sync g on g.contacto_id=c.id"
echo LISTO
