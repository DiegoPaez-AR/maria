#!/bin/bash
cd /root/secretaria
CF=config/instances/sofia-bruscoli.conf
echo "── flags WA en el .conf ──"; grep -E '^WA_(WARMUP|SALIENTE_OFF|VENTANA)' "$CF" || echo "  (ninguno)"
echo "── ¿el teléfono de Sofia habla con el hook? ──"
grep -E "\[MB|latido|mbdiag|ping" /root/.pm2/logs/sofia-bruscoli-out.log | tail -5
LAT=$(grep -cE "\[MB" /root/.pm2/logs/sofia-bruscoli-out.log)
echo "  líneas [MB en el log: $LAT"
if [ "$LAT" = "0" ]; then echo "  ⛔ el bridge nunca se conectó — NO encolo"; echo LISTO; exit 0; fi
echo "── WA activo: saco WA_WARMUP ──"
sed -i '/^WA_WARMUP=/d' "$CF"
timeout 90 pm2 reload ecosystem.config.js --only sofia-bruscoli --update-env >/dev/null 2>&1 && echo "  reload OK"
sleep 8
echo "── encolo el WA a Noelia (excepción puntual a la política, pedido de Diego) ──"
set -a; . "$CF"; . config/secrets.conf 2>/dev/null; set +a
timeout 30 node -e '
const ob = require("./wa-outbox");
const id = ob.encolar({ usuarioId: 2, numero: "5491155947242", texto: "Hola Noelia, soy Sofia. Solo para que lo tengas: este es mi WhatsApp, lo uso para coordinar con terceros (reuniones, confirmaciones, etc.). A mí escribime por Telegram: https://t.me/SofiaBruscoliAI_bot — o por mail si preferís. ¡Nos hablamos!", metadata: { origen: "bienvenida_wa", excepcion_politica: true } });
console.log("  wa_outbox #" + id);
'
echo LISTO
