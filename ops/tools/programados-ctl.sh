#!/bin/bash
# programados-ctl.sh — pausar / reanudar / estado de mensajes programados.
# Uso (en el VPS, con el env de la instancia):
#   bash ops/tools/programados-ctl.sh estado 1341 1342
#   bash ops/tools/programados-ctl.sh pausar 1352 1353 1354
#   bash ops/tools/programados-ctl.sh reanudar 1352
# Estados: 0=pendiente 1=enviado 2=en-vuelo -1=cancelado -2=pausado
set -e
ACCION="${1:?uso: programados-ctl.sh {estado|pausar|reanudar|cancelar} <id...>}"
shift
IDS=$(echo "$@" | tr ' ' ',')
[ -z "$IDS" ] && { echo "faltan ids"; exit 1; }
cat > /tmp/prog-ctl.cjs <<JS
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB);
const ids="${IDS}".split(",").map(Number).filter(Boolean);
const accion="${ACCION}";
for (const id of ids) {
  if (accion==="pausar")   db.prepare("UPDATE programados SET enviado=-2, razon='pausado-manual' WHERE id=? AND enviado IN (0,2)").run(id);
  if (accion==="reanudar") db.prepare("UPDATE programados SET enviado=0, razon=NULL WHERE id=? AND enviado=-2").run(id);
  if (accion==="cancelar") db.prepare("UPDATE programados SET enviado=-1, razon='cancelado-manual' WHERE id=? AND enviado IN (0,2,-2)").run(id);
  const r=db.prepare("SELECT id,cuando,enviado,razon,substr(texto,1,40) t FROM programados WHERE id=?").get(id);
  console.log(r ? JSON.stringify(r) : id+": no existe");
}
db.close();
JS
node /tmp/prog-ctl.cjs
rm -f /tmp/prog-ctl.cjs
# VERIFICACIÓN OBLIGATORIA (lección 17/8: una pausa que no corrió mató la campaña):
echo "^ verificá que el campo enviado quedó como esperabas ANTES de confiar."
