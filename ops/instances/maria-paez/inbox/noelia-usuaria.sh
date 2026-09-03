#!/bin/bash
cd /root/secretaria
echo "── Maria sigue con su Telegram? ──"
timeout 10 tail -30 /root/.pm2/logs/maria-paez-out.log | grep -E "telegram|TG\]" | tail -2
timeout 10 grep -c "409" /root/.pm2/logs/maria-paez-error.log | head -1 >/dev/null
echo "── cargar a Noelia como usuaria de SOFIA ──"
( set -a; . config/instances/sofia-bruscoli.conf; [ -f config/secrets.conf ] && . config/secrets.conf; set +a
  timeout 40 node -e "
  const usuarios=require('/root/secretaria/usuarios');
  const o=usuarios.obtenerOwner(); console.log('  owner de la instancia:', o && o.nombre, '(servido='+o.servido+')');
  const ya=usuarios.listarActivos().find(u=>/noelia/i.test(u.nombre));
  if (ya) { console.log('  Noelia ya existe:', ya.id); process.exit(0); }
  const u=usuarios.crear({ nombre:'Noelia Bruscoli', wa_cus:'5491155947242@c.us', email:'nbruscoli@luminaconsultora.com',
    tz:'America/Argentina/Buenos_Aires', idioma:'es', brief_hora:'07', brief_minuto:'30', ubicacion:'Buenos Aires, AR' });
  console.log('  creada:', u.id, u.nombre, u.email, u.wa_cus);
  console.log('  usuarios activos:', usuarios.listarActivos().map(x=>x.nombre+(x.servido?'':' [admin]')).join(', '));
  " 2>&1 | grep -v Warning )
echo LISTO
