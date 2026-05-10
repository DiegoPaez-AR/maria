#!/bin/bash
set +e
echo "── Buscar [WA alert] en log completo ──"
grep -E '\[WA alert\]|alert' /root/.pm2/logs/maria-paez-out.log 2>&1 | tail -10
echo
echo "── Cualquier error/exception en log de hoy ──"
grep -iE '2026-05-10.*\b(error|exception|TypeError|Cannot)\b' /root/.pm2/logs/maria-paez-out.log 2>&1 | grep -v 'pude' | tail -10
grep -E 'TypeError|ReferenceError|Cannot find module' /root/.pm2/logs/maria-paez-error.log 2>&1 | tail -10
echo
echo "── ¿hay log de error? ──"
wc -l /root/.pm2/logs/maria-paez-error.log
tail -30 /root/.pm2/logs/maria-paez-error.log
echo
echo "── log de hoy alrededor de las 11:07 (3min post-boot) ──"
awk '/2026-05-10 11:0[567]/' /root/.pm2/logs/maria-paez-out.log | grep -v 'qr\] escan' | grep -vE '^[█▀▄▌▐▂ ]+$' | head -30
