#!/bin/bash
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
echo "== healthcheck en vivo =="
bash /root/secretaria/ops/healthcheck.sh 2>&1 | tail -20
echo ""
echo "== errores invalid_grant en los últimos minutos (pm2) =="
pm2 logs maria-paez --lines 200 --nostream 2>/dev/null | grep -iE "invalid_grant|oauth|GMAIL|listar cal" | tail -15
echo ""
echo "== prueba directa: leer calendario del owner =="
cd /root/secretaria && node -e '
const g = require("./google");
(async () => {
  try {
    const r = await g.listarEventos ? "tiene listarEventos" : "no";
    const cal = require("./google");
    const now = new Date().toISOString();
    const res = await cal.calendarClient ? "ok-client" : "?";
    console.log("google module cargó ok");
  } catch(e){ console.log("ERR", e.message); }
})();
' 2>&1 | tail -5
