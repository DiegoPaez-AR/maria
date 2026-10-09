#!/bin/bash
cd /root/secretaria
echo "── Sofia 409: cuándo ──"
ls logs/sofia-bruscoli/ | head; for f in logs/sofia-bruscoli/error*.log logs/sofia-bruscoli/error*.gz; do [ -f "$f" ] || continue; (zcat -f "$f" 2>/dev/null) | grep -E "409" | sed -E 's/: \[TG\].*//' | cut -c1-13 | sort | uniq -c | head -12; done
for f in logs/sofia-bruscoli/out*.log logs/sofia-bruscoli/out*.gz; do [ -f "$f" ] || continue; (zcat -f "$f" 2>/dev/null) | grep -E "recuperado tras|alertado tras" | cut -c1-150; done | head -6
echo "── Maria 409 también? ──"
for f in logs/maria-paez/error*.log logs/maria-paez/error*.gz; do [ -f "$f" ] || continue; (zcat -f "$f" 2>/dev/null) | grep -c 409; done | paste -sd+ | bc
echo "── Personal 28/9: qué vio la app ──"
for f in logs/maria-paez/out*.log logs/maria-paez/out*.gz; do [ -f "$f" ] || continue; (zcat -f "$f" 2>/dev/null) | grep -E "2026-09-28 09:(1|2|3|4)" | grep -E "#277|#279" | head -8 | cut -c1-200; done
echo "── enriquecer: cuántos sobre stubs (nombre == local-part) ──"
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "select count(*), sum(perfil_web is not null) from contactos where lower(replace(nombre,' ','')) = lower(substr(email,1,instr(email,'@')-1))"
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "select count(*) from eventos where canal='sistema' and cuerpo like 'claude_call enriquecer%' and timestamp>=datetime('now','-30 days')"
echo LISTO
