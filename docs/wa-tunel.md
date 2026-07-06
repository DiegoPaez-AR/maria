# Túnel WA — salida por IP argentina (desde 2026-07-05)

## Qué es
El Chromium de WhatsApp sale por `WA_PROXY=socks5://127.0.0.1:1080` (seteado
en el .conf de la instancia). Ese puerto es un **túnel SSH inverso** que abre
la Mac de Diego contra el VPS (`ssh -N -R 1080 root@178.104.166.91` = reverse
dynamic SOCKS). Motivo: tras el incidente con Meta (revisión de cuenta,
2026-07-04), la teoría fue mismatch de IP (número AR saliendo por IP alemana
de Hetzner). SOLO WA usa el proxy; el resto de Maria sale por la IP del VPS.

## Lado Mac (NO está en este repo)
- LaunchAgent `~/Library/LaunchAgents/com.maria.tunel.plist`: corre
  `/usr/bin/ssh -N -R 1080 -o ServerAliveInterval=30 -o ServerAliveCountMax=3
  -o ExitOnForwardFailure=yes root@178.104.166.91`, con RunAtLoad +
  KeepAlive=true (launchd lo relanza si muere y lo arranca en cada login).
- Clave: `~/.ssh/id_ed25519` de la Mac, autorizada en el VPS.
- Sleep deshabilitado: `sudo pmset -a sleep 0 disablesleep 1`.
- Estado: `launchctl list | grep maria` (PID = vivo; exit code = mirar error).
- Kick manual: `launchctl kickstart -k gui/$(id -u)/com.maria.tunel`

## Lado VPS
- Guard en index.js: si WA_PROXY está seteado y el puerto no responde al
  boot, NO conecta WA, loguea evento `wa_tunel_caido`, entra en modo
  degradado (loops sin WA) y hace exit(0) a los 10min → pm2 lo relanza y
  reintenta. Cuando el túnel vuelve, reconecta solo (sin QR si la sesión vive).
- sshd keepalive (`/etc/ssh/sshd_config.d/99-maria-tunel-keepalive.conf`,
  desde 2026-07-06): ClientAliveInterval 30 / CountMax 3, para que un túnel
  muerto suelte el puerto 1080 en ~90s y el rebind de la Mac no falle.

## Síntomas de túnel caído / incidente 2026-07-06
- Maria sorda en WA; logs: `[programados] N mensaje(s) debidos, despachando…`
  repetido sin ✓, o `Runtime.callFunctionOn timed out` (Chromium colgado si
  el túnel murió con la sesión abierta → `pm2 restart maria-paez`), o
  `waClient no disponible`, o `⏸ [WA túnel] proxy ... no responde`.
- Causa típica: Mac colgada/apagada/sin internet. Fix: revivir la Mac; el
  túnel y Maria se recuperan solos (~10min). Verificar en VPS:
  `ss -tlnp | grep 1080`.
