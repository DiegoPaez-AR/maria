#!/bin/bash
cd /root/secretaria
for S in maria-paez sofia-bruscoli; do
  echo "[$S]"; grep -hoE "\[MB v[0-9.]+\]" logs/$S/out.log | tail -1
  grep -hE "\[MB v4\.9\]" logs/$S/out.log | grep -E "upd|listener conectado|svc\]|diálogo ajeno" | tail -4 | cut -c1-150
done
echo LISTO
