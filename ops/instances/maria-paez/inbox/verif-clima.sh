#!/bin/bash
echo "== fecha VPS =="; date
echo "== pm2 estado =="; pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);for(const p of a)console.log(p.name,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime="+new Date(p.pm2_env.pm_uptime).toISOString());}catch(e){console.log("jlist parse fail")}})'
echo "== schema usuarios (cols nuevas) =="
DB="${MARIA_DB:-state/maria-paez/db/maria.sqlite}"
echo "DB=$DB"
sqlite3 "$DB" "PRAGMA table_info(usuarios);" | grep -iE "ubicacion|lat|lon" || echo "(sqlite3 no encontro cols o no esta instalado)"
echo "== conteo ubicacion (backfill) =="
sqlite3 "$DB" "SELECT COALESCE(ubicacion,'(null)') u, COUNT(*) FROM usuarios GROUP BY u;" 2>/dev/null || echo "(no sqlite3)"
echo "== test clima en vivo desde VPS =="
node -e '
const clima=require("./clima");
(async()=>{
  const g=await clima.geocodificar("Buenos Aires, AR");
  console.log("geo BA:",JSON.stringify(g));
  if(g){const p=await clima.pronosticoHoy(g.lat,g.lon,"America/Argentina/Buenos_Aires");console.log("pronostico hoy:",JSON.stringify(p));}
})().catch(e=>console.log("clima ERR",e.message));
'
echo "== componerBrief de Diego (preview real) =="
node -e '
(async()=>{
  try{
    const usuarios=require("./usuarios");
    const mb=require("./morning-brief");
    const d=usuarios.resolverPorNombre("Diego")||usuarios.listarActivos()[0];
    if(!d){console.log("no encontre usuario");return;}
    console.log("usuario:",d.nombre,"ubicacion:",d.ubicacion,"lat/lon:",d.lat,d.lon);
    const txt=await mb.componerBrief(d);
    console.log("---BRIEF---");console.log(txt);console.log("---FIN---");
  }catch(e){console.log("brief ERR",e.message,e.stack);}
})();
'
