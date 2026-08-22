#!/bin/bash
echo "── build v4.0 ──"
grep -E "APK_OK|APK_FAIL|^e: file" /root/mariabridge-build.log | tail -2
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
cat > /tmp/ec.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── comandos de control ──");
db.prepare("SELECT id,cmd,estado,substr(resultado,1,140) r FROM mb_control ORDER BY id DESC LIMIT 6").all()
  .forEach(x=>console.log("  #"+x.id,x.cmd,"["+x.estado+"]",(x.r||"").slice(0,120)));
db.close();
JS
node /tmp/ec.cjs; rm -f /tmp/ec.cjs
echo "── versión app + últimos ctl ──"
grep "\[MB v" ~/.pm2/logs/maria-paez-out.log | tail -2
grep "\[ctl\]" ~/.pm2/logs/maria-paez-out.log | tail -4
echo LISTO
