package io.intensa.mariabridge

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Base64
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Manos remotas (v3.6, idea Diego): el WaSendService delega acá los comandos
 * de control que llegan por el poll (CTL|id|cmd|argsB64). shot=screenshot,
 * tap=gesto en x,y, home, nodos=dump de clickables. Requiere que quien llame
 * sea el AccessibilityService (screenshot y gestos son sus capacidades).
 */
object ControlOps {

    fun ejecutar(svc: AccessibilityService, base: String, secret: String, id: String, cmd: String, args: JSONObject) {
        MbLog.i("ctl", "comando #$id: $cmd $args")
        when (cmd) {
            "ping" -> _reportar(base, secret, id, true, null, "pong v${_ver(svc)}")
            "home" -> { svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME); _reportar(base, secret, id, true, null, "home") }
            "nodos" -> _reportar(base, secret, id, true, null, _dumpNodos(svc))
            "tap" -> _tap(svc, base, secret, id, args)
            "shot" -> _shot(svc, base, secret, id)
            else -> _reportar(base, secret, id, false, null, "cmd desconocido: $cmd")
        }
    }

    private fun _tap(svc: AccessibilityService, base: String, secret: String, id: String, args: JSONObject) {
        val x = args.optInt("x", -1); val y = args.optInt("y", -1)
        if (x < 0 || y < 0) { _reportar(base, secret, id, false, null, "tap sin x,y"); return }
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val g = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build()
        val despachado = svc.dispatchGesture(g, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(d: GestureDescription?) { _reportar(base, secret, id, true, null, "tap $x,$y ✓") }
            override fun onCancelled(d: GestureDescription?) { _reportar(base, secret, id, false, null, "tap $x,$y cancelado") }
        }, null)
        // Si el servicio no puede despachar gestos (falta canPerformGestures o
        // Android lo rechaza), NO hay callback → reportar YA para no dejar el
        // comando huérfano (causa del loop del 22/8).
        if (!despachado) _reportar(base, secret, id, false, null, "dispatchGesture rechazado (¿falta canPerformGestures?)")
    }

    private fun _shot(svc: AccessibilityService, base: String, secret: String, id: String) {
        if (Build.VERSION.SDK_INT < 30) { _reportar(base, secret, id, false, null, "screenshot requiere Android 11+"); return }
        svc.takeScreenshot(android.view.Display.DEFAULT_DISPLAY, { it.run() },
            object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(sr: AccessibilityService.ScreenshotResult) {
                    try {
                        val bmp = android.graphics.Bitmap.wrapHardwareBuffer(sr.hardwareBuffer, sr.colorSpace)
                        val soft = bmp?.copy(android.graphics.Bitmap.Config.ARGB_8888, false)
                        sr.hardwareBuffer.close()
                        if (soft == null) { _reportar(base, secret, id, false, null, "bitmap null"); return }
                        // reducir a mitad para no inflar la subida
                        val chico = android.graphics.Bitmap.createScaledBitmap(soft, soft.width / 2, soft.height / 2, true)
                        val bos = ByteArrayOutputStream()
                        chico.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, bos)
                        val b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
                        _reportar(base, secret, id, true, b64, "shot ${chico.width}x${chico.height}")
                    } catch (e: Exception) { _reportar(base, secret, id, false, null, "shot err: ${e.message}") }
                }
                override fun onFailure(code: Int) { _reportar(base, secret, id, false, null, "shot falló code=$code") }
            })
    }

    private fun _dumpNodos(svc: AccessibilityService): String {
        val root = svc.rootInActiveWindow ?: return "root null"
        val out = StringBuilder()
        fun rec(n: AccessibilityNodeInfo?, p: Int) {
            if (n == null || p > 12) return
            if (n.isClickable) {
                val id = n.viewIdResourceName?.substringAfterLast('/') ?: ""
                val tx = (n.text ?: n.contentDescription ?: "").toString().take(18)
                val r = android.graphics.Rect(); n.getBoundsInScreen(r)
                out.append("[$id|$tx|${r.centerX()},${r.centerY()}] ")
            }
            for (i in 0 until n.childCount) rec(n.getChild(i), p + 1)
        }
        rec(root, 0)
        return out.toString().take(480)
    }

    private fun _ver(svc: AccessibilityService) = try {
        svc.packageManager.getPackageInfo(svc.packageName, 0).versionName
    } catch (_: Exception) { "?" }

    private fun _reportar(base: String, secret: String, id: String, ok: Boolean, data: String?, texto: String?) {
        val body = JSONObject().put("id", id).put("ok", ok)
        if (data != null) body.put("data", data)
        if (texto != null) body.put("texto", texto)
        Net.postJson("$base/$secret/mbctl", body.toString())
        MbLog.i("ctl", "#$id → ${if (ok) "OK" else "FALLO"} ${texto ?: ""}")
    }
}
