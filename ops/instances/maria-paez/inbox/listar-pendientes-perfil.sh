#!/bin/bash
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "=== PENDIENTES (perfil_web NULL, con email) — id|uid|usuario|nombre|email ==="
sqlite3 "$DB" "SELECT c.id||'|'||c.usuario_id||'|'||COALESCE(u.nombre,'?')||'|'||c.nombre||'|'||c.email FROM contactos c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE c.email IS NOT NULL AND c.email!='' AND c.perfil_web IS NULL ORDER BY c.usuario_id, c.nombre;"
echo ""
echo "=== A REHACER (perfil con basura: Sources/http/markdown o muy largo) — id|nombre|email ==="
sqlite3 "$DB" "SELECT c.id||'|'||c.nombre||'|'||c.email||'  ||  '||substr(c.perfil_web,1,60) FROM contactos c WHERE c.perfil_web IS NOT NULL AND (c.perfil_web LIKE '%Sources%' OR c.perfil_web LIKE '%http%' OR c.perfil_web LIKE '%](%' OR c.perfil_web LIKE '%No pude%' OR c.perfil_web LIKE '%no aparece con claridad%');"
