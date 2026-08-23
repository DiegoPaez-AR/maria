#!/bin/bash
cd /root/secretaria
timeout 90 node -e '
(async () => {
  const usuarios=require("/root/secretaria/usuarios");
  const pb=require("/root/secretaria/prompt-builder");
  const u=usuarios.listarServidos().find(x=>x.nombre==="Diego");
  const p=await pb.construirPrompt({usuario:u,canal:"telegram",entrada:{de:"telegram:0",nombre:u.nombre,cuerpo:"hola"}});
  const sys=(typeof p==="object"&&p.system)?p.system:String(p);
  const ini=sys.indexOf("buscar_contacto_global");
  const cola=sys.slice(ini, ini+21000);
  console.log("=== QUÉ HAY EN LOS ~20k DESPUÉS DE buscar_contacto_global ===");
  console.log("(primera línea de cada bloque de 1200 chars)\n");
  for (let k=0;k<cola.length;k+=1200) {
    const trozo=cola.slice(k,k+1200);
    const prim=trozo.split("\n").find(l=>l.trim().length>25) || trozo.slice(0,80);
    console.log(String(k).padStart(6), "|", prim.trim().slice(0,110));
  }
})().catch(e=>console.log("ERR",e.message));'
echo LISTO
