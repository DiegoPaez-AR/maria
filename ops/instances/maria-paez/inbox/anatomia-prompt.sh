#!/bin/bash
cd /root/secretaria
timeout 90 node -e '
(async () => {
  const usuarios=require("/root/secretaria/usuarios");
  const pb=require("/root/secretaria/prompt-builder");
  const u=usuarios.listarServidos().find(x=>x.nombre==="Diego");
  const entrada={de:"telegram:0",nombre:u.nombre,cuerpo:"hola"};
  const p=await pb.construirPrompt({usuario:u,canal:"telegram",entrada});
  const sys=(typeof p==="object"&&p.system)?p.system:String(p);
  const ini=sys.indexOf("[CÓMO EJECUTÁS ACCIONES");
  const resto=sys.slice(ini);
  const fin=resto.indexOf("\n━━━", 200);
  const cat=fin>0?resto.slice(0,fin):resto;
  console.log("SYSTEM total:", sys.length, "chars");
  console.log("Catálogo de acciones:", cat.length, "chars ("+Math.round(cat.length/sys.length*100)+"% del system)");
  const partes=cat.split(/\n  \{ "tipo": "/);
  console.log("preámbulo del bloque:", partes[0].length, "chars");
  const tam=[];
  for (let k=1;k<partes.length;k++){
    const n=partes[k].slice(0,partes[k].indexOf("\""));
    tam.push([n,partes[k].length]);
  }
  console.log("acciones:", tam.length);
  tam.sort((a,b)=>b[1]-a[1]);
  console.log("\n── peso de cada acción ──");
  for (const [n,t] of tam) console.log(String(t).padStart(6), n);
  console.log("\nsuma de acciones:", tam.reduce((a,b)=>a+b[1],0));
  // ¿cuánto de esto ya viaja como schema MCP?
  const sch=require("/root/secretaria/action-schemas");
  const tools=sch.tools||sch.TOOLS||sch.schemas||null;
  const j=JSON.stringify(tools||sch);
  console.log("action-schemas serializado (lo que ya ve el modelo como tools):", j.length, "chars");
})().catch(e=>console.log("ERR",e.message));'
echo LISTO
