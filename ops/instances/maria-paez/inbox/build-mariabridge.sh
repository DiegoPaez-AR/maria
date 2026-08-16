#!/bin/bash
# Lanza el build de MariaBridge EN BACKGROUND (nohup) para no bloquear el cron.
# Progreso → /root/mariabridge-build.log (lo leemos con scripts sucesivos).
LOG=/root/mariabridge-build.log
if pgrep -f mb-build-worker >/dev/null; then echo "build ya corriendo"; exit 0; fi
cat > /root/mb-build-worker.sh <<'WORKER'
#!/bin/bash
exec > /root/mariabridge-build.log 2>&1
set -x
echo "=== BUILD MariaBridge $(date) ==="
export DEBIAN_FRONTEND=noninteractive
SDK=/root/android-sdk
SRC=/root/secretaria/ops/mariabridge

echo "── 1. JDK 17 ──"
which java || apt-get install -y openjdk-17-jdk-headless
java -version

echo "── 2. cmdline-tools ──"
if [ ! -d "$SDK/cmdline-tools/latest" ]; then
  mkdir -p "$SDK/cmdline-tools"
  cd /tmp && curl -sL -o clt.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q -o clt.zip -d "$SDK/cmdline-tools"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
fi
export ANDROID_SDK_ROOT="$SDK"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

echo "── 3. licencias + paquetes SDK ──"
yes | sdkmanager --licenses >/dev/null 2>&1
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

echo "── 4. gradle ──"
if ! which gradle >/dev/null; then
  cd /tmp && curl -sL -o gradle.zip "https://services.gradle.org/distributions/gradle-8.7-bin.zip"
  unzip -q -o gradle.zip -d /opt
fi
export PATH="/opt/gradle-8.7/bin:$PATH"
gradle -version | head -3

echo "── 5. build ──"
cd "$SRC"
echo "sdk.dir=$SDK" > local.properties
export GRADLE_OPTS="-Xmx1536m -Dorg.gradle.daemon=false"
gradle assembleDebug --no-daemon --stacktrace 2>&1 | tail -60

echo "── 6. resultado ──"
APK=$(find "$SRC/app/build/outputs/apk/debug" -name '*.apk' 2>/dev/null | head -1)
if [ -n "$APK" ]; then
  DEST=/var/www/intensa.io/_dl
  mkdir -p "$DEST"
  TOKEN=$(openssl rand -hex 8)
  cp "$APK" "$DEST/mariabridge-$TOKEN.apk"
  chown -R www-data:www-data "$DEST" 2>/dev/null
  chmod 644 "$DEST/mariabridge-$TOKEN.apk"
  echo "APK_OK size=$(du -h "$APK" | cut -f1) url=https://intensa.io/_dl/mariabridge-$TOKEN.apk"
else
  echo "APK_FAIL — no se generó el apk"
fi
echo "=== FIN $(date) ==="
WORKER
chmod +x /root/mb-build-worker.sh
nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 &
echo "build lanzado en background (pid $!) — progreso en /root/mariabridge-build.log"
