#!/bin/bash
python3 - <<'PY'
s = open('/root/mb-build-worker.sh').read()
marca = 'cd "$SRC"; echo "sdk.dir=$SDK" > local.properties'
if 'rm -rf "$SRC/app/build/outputs"' not in s and marca in s:
    s = s.replace(marca, 'cd "$SRC"; rm -rf "$SRC/app/build/outputs"  # nunca servir un APK stale de un build fallido\necho "sdk.dir=$SDK" > local.properties')
    open('/root/mb-build-worker.sh','w').write(s)
    print("worker limpia outputs OK")
else:
    print("worker: ya estaba o marca no encontrada")
PY
