#!/bin/bash
cd /root/secretaria
echo "── logs del intento (enviar_wa / wa-send / outbox) ──"
timeout 20 grep -nE "enviar_wa|wa-send|wa-outbox|5491150105262|executor.*FALL|accion.*FALL" /root/.pm2/logs/maria-paez-out.log | tail -30
echo ""
echo "── errores ──"
timeout 15 tail -60 /root/.pm2/logs/maria-paez-error.log | tail -20
echo ""
echo "── ¿quién es Nati? usuario o contacto ──"
timeout 20 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print(" usuarios que matchean:")
for r in db.execute("SELECT id,nombre,activo,servido,wa_cus,wa_lid,email,telegram_chat_id FROM usuarios WHERE nombre LIKE '%Nat%'"):
    print("  ", dict(r))
print(" contactos que matchean:")
for r in db.execute("SELECT id,usuario_id,nombre,whatsapp,email,no_contactar FROM contactos WHERE nombre LIKE '%Nat%'"):
    print("  ", dict(r))
print(" outbox reciente:")
for r in db.execute("SELECT id,numero,estado,intentos,substr(texto,1,50) t FROM wa_outbox ORDER BY id DESC LIMIT 6"):
    print("  ", dict(r))
db.close()
PY
echo ""
echo "── vars de política en el proceso ──"
timeout 20 node -e "
const e=process.env;
for (const k of ['WA_SALIENTE_OFF','WA_WARMUP','WA_VENTANA_DESDE','WA_VENTANA_HASTA','MARIA_SESIONES','MARIA_SESIONES_USUARIOS'])
  console.log('  '+k+'='+(e[k]===undefined?'(no seteada)':e[k]));"
echo LISTO
