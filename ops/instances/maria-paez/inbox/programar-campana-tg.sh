#!/bin/bash
cd /root/secretaria
# post-mudanza: el secret vive en el .conf de la instancia
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const users=db.prepare(\"SELECT id,nombre,wa_cus FROM usuarios WHERE activo=1 AND (servido IS NULL OR servido=1) AND telegram_chat_id IS NULL AND wa_cus IS NOT NULL ORDER BY id\").all();
db.close();
const base='2026-08-17T10:00:00-03:00';
const t0=new Date(base).getTime();
(async () => {
  let i=0, ok=0, fail=0;
  for (const u of users) {
    const primerNombre=String(u.nombre).trim().split(/\s+/)[0];
    const cuando=new Date(t0 + i*15*60*1000).toISOString();
    const texto=\`¡Hola \${primerNombre}! Te cuento algo útil: ahora también podés hablarme por Telegram — misma Maria, me acuerdo de todo igual. Sirve como respaldo si WhatsApp anda mal (como pasó hace unas semanas) y es más cómodo para audios y archivos. Vincularte toma un minuto: entrá a t.me/MariaPaezAI_bot y tocá \\\"compartir mi número\\\". Listo. Si preferís seguir solo por acá, todo bien igual 🙂\`;
    const r=await fetch(\`http://127.0.0.1:${PORT}/accion\`,{method:'POST',headers:{'x-intensa-secret':'${SECRET}','Content-Type':'application/json'},
      body:JSON.stringify({usuarioId:1,accion:{tipo:'programar_mensaje',cuando,canal:'whatsapp',destino:u.wa_cus,texto},canalOrigen:'whatsapp'})}).then(x=>x.json()).catch(e=>({error:e.message}));
    if(r&&r.ok!==false&&!r.error){ok++;console.log(\`✔ \${u.nombre} → \${cuando}\`);}else{fail++;console.log(\`✗ \${u.nombre}:\`,JSON.stringify(r).slice(0,120));}
    i++;
  }
  console.log(\`programados: \${ok} ok, \${fail} fallos\`);
})();
"
echo LISTO
