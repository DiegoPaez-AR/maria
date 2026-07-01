#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/fix-gabi-resolucion.out"
DB="${MARIA_DB:?}"
NUM='5491165286555'
{
echo "=== ANTES: eventos con de=Gabi por uid y direccion ==="
sqlite3 -column -header "$DB" "SELECT usuario_id, direccion, COUNT(*) n FROM eventos WHERE de LIKE '%$NUM%' GROUP BY usuario_id, direccion ORDER BY usuario_id, direccion;"
echo
echo "=== MIGRACION: de=Gabi y usuario_id=1 -> 18 ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; UPDATE eventos SET usuario_id=18 WHERE de LIKE '%$NUM%' AND usuario_id=1;"
echo "exit_update=$?"
echo
echo "=== DESPUES: mismo breakdown (no debe quedar uid=1) ==="
sqlite3 -column -header "$DB" "SELECT usuario_id, direccion, COUNT(*) n FROM eventos WHERE de LIKE '%$NUM%' GROUP BY usuario_id, direccion ORDER BY usuario_id, direccion;"
echo
echo "=== wa_cus de Gabi + resolucion SQL (debe dar 18) ==="
sqlite3 "$DB" "SELECT id,wa_lid,wa_cus FROM usuarios WHERE id=18;"
sqlite3 "$DB" "SELECT id,nombre FROM usuarios WHERE wa_cus='${NUM}@c.us' AND activo=1;"
echo
echo "=== RELOAD para activar la resolucion en el proceso vivo ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env; echo "exit_reload=$?"
sleep 8
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})'
pm2 logs maria-paez --nostream --lines 4 2>/dev/null | tail -4
} > "$OUT" 2>&1
echo done >> "$OUT"
