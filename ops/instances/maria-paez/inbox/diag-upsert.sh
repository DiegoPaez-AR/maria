#!/bin/bash
cd /root/secretaria
echo "── los fallos de upsert_contacto de hoy ──"
timeout 15 grep -E "2026-09-02.*upsert_contacto" /root/.pm2/logs/maria-paez-out.log /root/.pm2/logs/maria-paez-error.log | tail -8 | cut -c1-400
echo ""
echo "── fichas de Noelia y Luciano AHORA ──"
timeout 20 node -e "
const mem=require('/root/secretaria/memory');
mem.db.prepare(\"SELECT id,usuario_id,nombre,whatsapp,email,visibilidad FROM contactos WHERE nombre LIKE '%Noelia%' OR nombre LIKE '%Luciano%' OR nombre LIKE '%Bruscoli%' OR nombre LIKE '%Peroni%'\").all().forEach(c=>console.log(' ',JSON.stringify(c)));"
echo LISTO
