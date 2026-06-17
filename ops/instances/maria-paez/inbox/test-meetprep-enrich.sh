#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/tme.js <<'JS'
const { invocarClaude } = require('/root/secretaria/claude-client');
// Replico el prompt de _enriquecerAsistente para un par de casos reales
async function probe(nom, empresa, email){
  const prompt = `Buscá en la web quién es esta persona, para darle contexto a Diego antes de una reunión.
Persona: ${nom}${empresa ? ` (empresa probable según su email: ${empresa})` : ''}
Email: ${email}

Devolvé UNA sola línea corta (máx ~110 caracteres) con su ROL/CARGO y EMPRESA actuales si los encontrás con confianza razonable (ej: "Director Comercial en Acme" o "Founder & CEO, Acme"). Si no encontrás info confiable de ESTA persona, devolvé EXACTAMENTE: sin datos
No inventes ni completes con suposiciones. Sin comillas ni explicaciones: solo la línea.`;
  try { let r = await invocarClaude(prompt, { timeoutMs: 70000 }); r=String(r||'').replace(/\s+/g,' ').trim(); console.log(`[${email}] -> ${r.slice(0,160)}`); }
  catch(e){ console.log(`[${email}] ERROR ${e.message}`); }
}
(async()=>{
  await probe('Nicolas Jordan','enpiric.com','nicolas.jordan@enpiric.com');
  await probe('Pablo Vizzotti', null, 'pvizzotti@gmail.com');
})().catch(e=>console.log('FATAL',e.message));
JS
timeout 180 node /tmp/tme.js 2>&1; rm -f /tmp/tme.js
