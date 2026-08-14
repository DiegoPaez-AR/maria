#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
DB="${MARIA_DB:?}"
sqlite3 "$DB" "UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente';"
node -e "
const ob = require('/root/secretaria/wa-outbox');
const usuarios = require('/root/secretaria/usuarios');
const owner = usuarios.obtenerOwner();
const num = (owner.wa_cus || '').replace(/[^0-9]/g, '');
console.log('encolado id=' + ob.encolar({ usuarioId: owner.id, numero: num, texto: 'Prueba 7: con AutoInput activado. Si sale solo, listo el canal de salida.' }));
"
