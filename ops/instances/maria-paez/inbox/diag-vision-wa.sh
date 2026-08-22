#!/bin/bash
echo "── logs del turno con la imagen (23:57-23:59) ──"
grep -E "MB-MEDIA|adjunto|attachment|maria-mb" ~/.pm2/logs/maria-paez-out.log | tail -8
echo "── ¿el archivo llegó a media-store? ──"
ls -la /root/secretaria/state/maria-paez/media/ 2>/dev/null | tail -4
echo "── ¿cómo se pasan los adjuntos al LLM? (prompt-builder) ──"
grep -n "attachmentPath\|@\${" /root/secretaria/prompt-builder.js | head -8
echo "── sandbox: ¿bwrap monta /tmp? ──"
grep -n "bwrap\|--bind\|/tmp" /root/secretaria/claude-client.js | head -10
echo LISTO
