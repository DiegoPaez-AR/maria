#!/bin/bash
# 30/10 (aprobado Diego): con 4.13 instalada, re-encolar #309 (Nespresso hogar) que abortó por el control de nombre
cd /root/secretaria
for s in maria-paez sofia-bruscoli; do echo "$s: $(grep '\[MB v' logs/$s/out.log | tail -1 | grep -o 'MB v[0-9.]*')"; grep "\[MB " logs/$s/out.log | grep -E "\[boot\]|\[svc\]" | tail -2 | cut -c1-150; done
if grep "\[MB v4.13" logs/maria-paez/out.log >/dev/null; then
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 "$MARIA_DB" "UPDATE wa_outbox SET estado='pendiente', intentos=0, tomado_en=NULL, creado=CURRENT_TIMESTAMP, metadata_json=json_remove(metadata_json,'\$.cold_fallos','\$.cold_motivo') WHERE id=309 AND estado='vencido'; SELECT id, estado, intentos, creado, metadata_json FROM wa_outbox WHERE id=309;" )
else echo "Maria todavía no está en 4.13 — no re-encolo"; fi
