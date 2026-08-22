#!/bin/bash
cd /root/secretaria
cat > /tmp/medir.cjs <<'JS'
(async () => {
  const usuarios = require('/root/secretaria/usuarios');
  const pb = require('/root/secretaria/prompt-builder');
  const activos = usuarios.listarActivos().filter(u => u.servido !== 0);
  const u = activos[0];
  console.log('usuario de muestra:', u && u.nombre, '| activos:', activos.length);
  const entrada = { de: 'telegram:0', nombre: u.nombre, cuerpo: 'hola, ¿qué tengo hoy?' };
  const p = await pb.construirPrompt({ usuario: u, canal: 'telegram', entrada });
  const sys = (typeof p === 'object' && p.system) ? p.system : String(p);
  const usr = (typeof p === 'object' && p.user) ? p.user : '';
  console.log('split:', typeof p === 'object' && !!p.system ? 'SÍ {system,user}' : 'NO (string único)');
  console.log('system:', sys.length, 'chars ≈', Math.round(sys.length/3.5), 'tokens');
  console.log('user  :', usr.length, 'chars ≈', Math.round(usr.length/3.5), 'tokens');
  // desglose por sección [XXX]
  const partes = sys.split(/\n(?=\[)/);
  const tam = partes.map(x => [ (x.split('\n')[0]||'').slice(0,55), x.length ]).sort((a,b)=>b[1]-a[1]);
  console.log('── secciones del system (top 18) ──');
  for (const [t,n] of tam.slice(0,18)) console.log(String(n).padStart(7), t);
  const turno = await pb.construirTurnoSesion({ usuario: u, canal: 'telegram', entrada });
  console.log('turno compacto (sesiones):', turno.length, 'chars ≈', Math.round(turno.length/3.5), 'tokens');
  console.log('AHORRO por turno con sesión ≈', Math.round((sys.length + usr.length - turno.length)/3.5), 'tokens');
})().catch(e => console.error('ERR', e.stack));
JS
node /tmp/medir.cjs; rm -f /tmp/medir.cjs
echo LISTO
