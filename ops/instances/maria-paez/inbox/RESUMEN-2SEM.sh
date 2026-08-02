#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== tráfico por canal/día (desde 17/7) =="
sqlite3 "$DB" "SELECT date(timestamp), canal, direccion, COUNT(*) FROM eventos WHERE timestamp > '2026-07-17' AND canal IN ('telegram','whatsapp','gmail') GROUP BY 1,2,3 ORDER BY 1;"
echo "== entrantes por remitente (desde 17/7) =="
sqlite3 "$DB" "SELECT canal, COALESCE(de,'?'), COUNT(*) FROM eventos WHERE timestamp > '2026-07-17' AND direccion='entrante' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10;"
echo "== errores sistema (desde 17/7, agrupados) =="
sqlite3 "$DB" "SELECT substr(cuerpo,1,70), COUNT(*) FROM eventos WHERE timestamp > '2026-07-17' AND canal='sistema' AND (cuerpo LIKE '%falló%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%FALLO%') GROUP BY 1 ORDER BY 2 DESC LIMIT 10;"
echo "== pendientes abiertos =="
sqlite3 "$DB" "SELECT COUNT(*) FROM pendientes WHERE estado='abierto';"
echo "== programados pendientes =="
sqlite3 "$DB" "SELECT id, cuando, substr(texto,1,40) FROM programados WHERE enviado=0 ORDER BY cuando LIMIT 5;"
echo "== túnel =="
ss -tlnp | grep -q 1080 && echo "puerto 1080: escucha" || echo "puerto 1080: NO ESCUCHA"
IP=$(curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo FALLO)
echo "egreso socks5: $IP"
ps -o pid,etime -C sshd | grep -v PID | tail -2
echo "== wa-apagado =="
ls /root/secretaria/state/maria-paez/wa-apagado 2>/dev/null || echo "no está"
