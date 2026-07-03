#!/bin/bash
cd /root/secretaria
env -i PATH="$PATH" HOME=/root TZ=America/Argentina/Buenos_Aires \
  node --test test/executor-routing.test.js 2>&1 | grep -B4 "at Object" | head -20
echo LISTO
