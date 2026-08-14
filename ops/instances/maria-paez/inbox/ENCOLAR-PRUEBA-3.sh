#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
DB="${MARIA_DB:?}"
# cerrar los viejos para que no se repitan
sqlite3 "$DB" "UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente';"
node -e "
const ob = require('/root/secretaria/wa-outbox');
const usuarios = require('/root/secretaria/usuarios');
const owner = usuarios.obtenerOwner();
const num = (owner.wa_cus || '').replace(/[^0-9]/g, '');
const id = ob.encolar({ usuarioId: owner.id, numero: num, texto: 'Prueba 3 — buscando coordenadas del boton enviar.' });
console.log('encolado id=' + id);
"
