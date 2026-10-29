#!/bin/bash
# 29/10 (aprobado Diego): la ficha 618 es la línea EMPRESAS de Nespresso → renombrarla al nombre verificado
# y cerrar la gestión #378 / follow-up #84 abiertos contra ese número (canal equivocado para una CitiZ hogareña).
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 "$MARIA_DB" "UPDATE contactos SET nombre='Nespresso Professional Argentina', notas='Línea de Nespresso para EMPRESAS (pide CUIT y razón social). Para máquinas de hogar usar Nespresso Argentina atención al cliente: WhatsApp +54 9 11 3335 0233 / 0800 999 0392.' WHERE id=618;
  UPDATE pendientes SET estado='cerrado', cerrado=CURRENT_TIMESTAMP WHERE id IN (377,378) AND estado='abierto';
  UPDATE follow_ups SET estado='cancelado' WHERE id=84 AND estado IN ('abierto','disparado');
  SELECT id, nombre, whatsapp FROM contactos WHERE id=618;
  SELECT id, estado FROM pendientes WHERE id IN (377,378);
  SELECT id, estado FROM follow_ups WHERE id=84;" 2>&1 )
grep -c "fichaEnVisible" wa-hook.js
