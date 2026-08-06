#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node -e "
const ob = require('/root/secretaria/wa-outbox');
const usuarios = require('/root/secretaria/usuarios');
const owner = usuarios.obtenerOwner();
const num = (owner.wa_cus || '').replace(/[^0-9]/g, '');
if (!num) { console.log('owner sin wa_cus'); process.exit(0); }
const id = ob.encolar({ usuarioId: owner.id, numero: num, texto: 'Prueba del canal de salida — si ves esto, Tasker levantó el mensaje de la cola.' });
console.log('encolado id=' + id + ' → +' + num);
"
SEC=$(grep WA_HOOK_SECRET /root/secretaria/config/secrets.conf | cut -d= -f2)
echo "== lo que va a ver Tasker =="
curl -s -m 10 "https://intensa.io/hooks/wa-maria/$SEC/pendiente"; echo
