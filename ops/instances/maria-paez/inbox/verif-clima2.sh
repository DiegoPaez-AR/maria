#!/bin/bash
echo "== fecha =="; date
echo "== forzar reload del codigo nuevo =="
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -3 || echo "reload fallo"
sleep 6
echo "== pm2 estado post-reload =="
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(p=>p.name==="maria-paez"&&console.log(p.name,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime="+new Date(p.pm2_env.pm_uptime).toISOString()));}catch(e){console.log("parse fail")}})'
echo "== schema + clima + brief (via node/better-sqlite3) =="
node -e '
(async()=>{
  try{
    const mem=require("./memory");
    const cols=mem.db.prepare("PRAGMA table_info(usuarios)").all().map(c=>c.name).filter(n=>["ubicacion","lat","lon"].includes(n));
    console.log("cols nuevas:",cols.join(",")||"(ninguna!)");
    const dist=mem.db.prepare("SELECT COALESCE(ubicacion,\"(null)\") u, COUNT(*) n FROM usuarios GROUP BY u").all();
    console.log("ubicaciones:",JSON.stringify(dist));
    const clima=require("./clima");
    const g=await clima.geocodificar("Buenos Aires, AR");
    console.log("geo BA,AR:",JSON.stringify(g));
    if(g){const pr=await clima.pronosticoHoy(g.lat,g.lon,"America/Argentina/Buenos_Aires");console.log("pronostico:",JSON.stringify(pr));}
    const usuarios=require("./usuarios");
    const mb=require("./morning-brief");
    const d=usuarios.resolverPorNombre("Diego")||usuarios.listarActivos()[0];
    console.log("---BRIEF "+d.nombre+" (ubic="+d.ubicacion+")---");
    console.log(await mb.componerBrief(d));
    console.log("---FIN---");
  }catch(e){console.log("ERR",e.message,e.stack);}
})();
'
