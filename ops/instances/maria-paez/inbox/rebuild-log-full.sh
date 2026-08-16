#!/bin/bash
if pgrep -f mb-build-worker >/dev/null; then echo "corriendo"; exit 0; fi
cat > /root/mb-build-worker.sh <<'WORKER'
#!/bin/bash
exec > /root/mariabridge-build.log 2>&1
SDK=/root/android-sdk; SRC=/root/secretaria/ops/mariabridge
export ANDROID_SDK_ROOT="$SDK"
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
export PATH="/opt/gradle-8.7/bin:$SDK/cmdline-tools/latest/bin:$PATH"
cd "$SRC"; echo "sdk.dir=$SDK" > local.properties
export GRADLE_OPTS="-Xmx1536m -Dorg.gradle.daemon=false"
echo "=== rebuild $(date) ==="
gradle assembleDebug --no-daemon 2>&1   # log COMPLETO, sin tail
APK=$(find "$SRC/app/build/outputs/apk/debug" -name '*.apk' 2>/dev/null | head -1)
if [ -n "$APK" ]; then
  DEST=/var/www/intensa.io/_dl; mkdir -p "$DEST"; TK=$(openssl rand -hex 8)
  cp "$APK" "$DEST/mb-$TK.apk"; chown www-data:www-data "$DEST/mb-$TK.apk" 2>/dev/null; chmod 644 "$DEST/mb-$TK.apk"
  echo "APK_OK url=https://intensa.io/_dl/mb-$TK.apk size=$(du -h "$APK"|cut -f1)"
else echo "APK_FAIL"; fi
echo "=== FIN $(date) ==="
WORKER
chmod +x /root/mb-build-worker.sh
nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 &
echo "rebuild lanzado (pid $!)"
