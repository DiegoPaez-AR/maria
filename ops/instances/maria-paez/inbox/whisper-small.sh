#!/bin/bash
set -e
cd /root/whisper.cpp/models
if [ ! -f ggml-small.bin ]; then
  echo "descargando ggml-small (~466MB)…"
  curl -sL -o ggml-small.bin "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
fi
ls -lh ggml-small.bin | awk '{print "modelo:", $5, $9}'
CONF=/root/secretaria/config/instances/maria-paez.conf
if ! grep -q "^WHISPER_MODEL=" "$CONF"; then
  echo "" >> "$CONF"
  echo "# Whisper small (2026-08-17: base transcribía regular los audios de voz)" >> "$CONF"
  echo "WHISPER_MODEL=/root/whisper.cpp/models/ggml-small.bin" >> "$CONF"
  echo "WHISPER_MODEL agregado al conf"
else
  sed -i 's|^WHISPER_MODEL=.*|WHISPER_MODEL=/root/whisper.cpp/models/ggml-small.bin|' "$CONF"
  echo "WHISPER_MODEL actualizado"
fi
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
# smoke: 3s de tono → no valida calidad pero sí el pipeline con el modelo nuevo
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=440:duration=2" -ar 16000 -ac 1 /tmp/t.wav
/root/whisper.cpp/build/bin/whisper-cli -m /root/whisper.cpp/models/ggml-small.bin -f /tmp/t.wav -l es -t 4 --no-prints >/dev/null 2>&1 && echo "whisper small corre OK" || echo "whisper small FALLO"
rm -f /tmp/t.wav*
echo LISTO
