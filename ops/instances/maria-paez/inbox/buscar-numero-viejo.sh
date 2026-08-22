#!/bin/bash
echo "── en configs ──"
grep -rn "79043441\|7904 3441\|7904-3441" /root/secretaria/config/ 2>/dev/null | head -5 || echo "  (nada en config)"
echo "── variables de identidad en el .conf ──"
grep -E "^(ASISTENTE_|OWNER_)" /root/secretaria/config/instances/maria-paez.conf | grep -iv secret | head -10
cat > /tmp/bn.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const q=(s,...a)=>db.prepare(s).all(...a);
console.log("── contactos con el número viejo de Maria ──");
q(`SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE whatsapp LIKE '%79043441%'`).forEach(x=>console.log("  #"+x.id,"u"+x.usuario_id,x.nombre,x.whatsapp));
console.log("── usuarios con ese número ──");
q(`SELECT id,nombre,wa_cus,wa_lid FROM usuarios WHERE wa_cus LIKE '%79043441%' OR wa_lid LIKE '%79043441%'`).forEach(x=>console.log("  u"+x.id,x.nombre,x.wa_cus));
console.log("── hechos/memoria que lo mencionen ──");
q(`SELECT clave,substr(valor,1,60) v FROM hechos WHERE valor LIKE '%79043441%' OR valor LIKE '%7904%' LIMIT 5`).forEach(x=>console.log("  ",x.clave,x.v));
console.log("── ¿número nuevo ya aparece en algún entrante? (test de recepción) ──");
q(`SELECT timestamp,de,substr(cuerpo,1,40) c FROM eventos WHERE de LIKE '%66446137%' OR cuerpo LIKE '%6644%' ORDER BY id DESC LIMIT 3`).forEach(x=>console.log("  ",x.timestamp.slice(5,16),x.de,x.c));
db.close();
JS
node /tmp/bn.cjs 2>&1 | head -25; rm -f /tmp/bn.cjs
echo "── marker de WA apagado + switch ──"
ls /root/secretaria/state/maria-paez/ 2>/dev/null | grep -i "wa\|apagad" | head -5
grep -n "WA_SALIENTE_OFF\|WA_APAGADO" /root/secretaria/config/instances/maria-paez.conf
echo LISTO
