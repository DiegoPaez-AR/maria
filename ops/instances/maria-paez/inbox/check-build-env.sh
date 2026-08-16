#!/bin/bash
echo "── recursos VPS ──"
free -h | head -2; df -h / | tail -1
java -version 2>&1 | head -1
curl -sI -m 10 https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip | head -1
echo LISTO
