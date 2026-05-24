#!/bin/bash
# Sonda + restart limpio de maria-paez.
# Motivo: 24/05 06:02 ART el proceso re-ejecutó boot() 2 veces
# (2x "Maria arrancó" + 2x EADDRINUSE :4501) sin que pm2 registre restart
# -> riesgo de loops duplicados. Restart para colapsar a un arranque único.
set +e
cd /root/secretaria 2>/dev/null

echo "########## ANTES ##########"
date -Is
echo
echo "--- pm2 list ---"
pm2 list 2>/dev/null
echo
echo "--- listeners en :4501 ---"
ss -ltnp 2>/dev/null | grep ':4501' || echo "(nada escuchando en 4501)"
echo
LOGS=$(pm2 logs maria-paez --lines 5000 --nostream 2>/dev/null)
echo "--- conteo en pm2 logs (ultimas 5000 lineas) ---"
echo "  'Maria arrancó' x $(echo "$LOGS" | grep -c 'Maria arrancó')"
echo "  'EADDRINUSE'     x $(echo "$LOGS" | grep -c 'EADDRINUSE')"
echo "  'WA ready'       x $(echo "$LOGS" | grep -c 'WA ready')"
echo
echo "--- ultima actividad WA ---"
echo "$LOGS" | grep -E '\[WA (.|ready)' | tail -5

echo
echo "########## RESTART ##########"
pm2 restart maria-paez 2>&1
echo "restart lanzado — esperando 40s para que reconecte WhatsApp..."
sleep 40

echo
echo "########## DESPUES ##########"
date -Is
echo
echo "--- pm2 list ---"
pm2 list 2>/dev/null
echo
echo "--- listeners en :4501 (debe haber exactamente 1) ---"
ss -ltnp 2>/dev/null | grep ':4501' || echo "(nada escuchando en 4501)"
echo
echo "--- log del arranque nuevo (ultimas 55 lineas) ---"
pm2 logs maria-paez --lines 55 --nostream 2>/dev/null | tail -55
echo
echo "########## FIN ##########"
