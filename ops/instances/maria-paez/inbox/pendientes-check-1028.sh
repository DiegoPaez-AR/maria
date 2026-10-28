#!/bin/bash
# Solo lectura: verificación de lo deployado 19-23/10
cd /root/secretaria/logs
for s in maria-paez sofia-bruscoli; do
  echo "════ $s: MB desde 19/10 (upd/boot/svc) ════"
  cat $s/out__2026-10-2*.log $s/out.log 2>/dev/null | grep "\[MB " | grep -E "\[boot\]|\[svc\]|versión nueva|instalador|listener creado" | awk '$1>="2026-10-19"' | tail -12 | cut -c1-200
  echo "── versión reportada hoy ──"; grep "\[MB v" $s/out.log | tail -1 | grep -o "MB v[0-9.]*"
done
echo "════ envíos en frío desde 19/10: verificación ════"
cat maria-paez/out__2026-10-2*.log maria-paez/out.log 2>/dev/null | grep -E "verificación #[0-9]+: ENVIADO|veredicto por foto|lectura [0-9]/3" | awk '$1>="2026-10-19"' | cut -c1-170 | tail -25
echo "════ reporte semanal (lunes 26/10) ════"; grep -E "enviado|falló|Error" ops/daily-report.log | tail -4
echo "════ avisos de 'sale a las 8' ════"; cd /root/secretaria; ( set -a; . config/instances/maria-paez.conf; set +a; sqlite3 "$MARIA_DB" "select count(*) from eventos where metadata_json like '%\"sale\":%' and timestamp>='2026-10-19';" )
