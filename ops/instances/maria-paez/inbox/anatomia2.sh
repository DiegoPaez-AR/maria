#!/bin/bash
cd /root/secretaria
timeout 90 node -e '
(async () => {
  const usuarios=require("/root/secretaria/usuarios");
  const pb=require("/root/secretaria/prompt-builder");
  const u=usuarios.listarServidos().find(x=>x.nombre==="Diego");
  const p=await pb.construirPrompt({usuario:u,canal:"telegram",entrada:{de:"telegram:0",nombre:u.nombre,cuerpo:"hola"}});
  const sys=(typeof p==="object"&&p.system)?p.system:String(p);
  console.log("SYSTEM total:", sys.length);
  console.log("\n── TODAS las secciones del system, por tamaño ──");
  const idx=[];
  const re=/\n\[([^\]\n]{3,70})\]/g; let m;
  while ((m=re.exec(sys))) idx.push([m.index, m[1]]);
  idx.push([sys.length,"(fin)"]);
  const secs=[];
  for (let k=0;k<idx.length-1;k++) secs.push([idx[k][1], idx[k+1][0]-idx[k][0]]);
  secs.sort((a,b)=>b[1]-a[1]);
  for (const [n,t] of secs) console.log(String(t).padStart(6), n);
  // catálogo completo = desde "Tipos de acción disponibles" hasta la próxima sección
  const ini=sys.indexOf("Tipos de acción disponibles");
  const sig=sys.indexOf("\n[", ini);
  const cat=sys.slice(ini, sig>0?sig:sys.length);
  console.log("\nCatálogo (Tipos de acción disponibles → siguiente sección):", cat.length, "chars");
  const partes=cat.split(/\n  \{ "tipo": "/);
  const tam=[];
  for (let k=1;k<partes.length;k++){ const n=partes[k].slice(0,partes[k].indexOf("\"")); tam.push([n,partes[k].length]); }
  tam.sort((a,b)=>b[1]-a[1]);
  console.log("acciones:", tam.length, "| suma:", tam.reduce((a,b)=>a+b[1],0));
  console.log("\n── peso por acción ──");
  for (const [n,t] of tam) console.log(String(t).padStart(6), n);
})().catch(e=>console.log("ERR",e.message));'
echo LISTO
