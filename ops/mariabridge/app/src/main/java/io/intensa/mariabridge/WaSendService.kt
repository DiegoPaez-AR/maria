package io.intensa.mariabridge

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.net.URLEncoder

/**
 * Envío EN FRÍO por accesibilidad: abre wa.me/<num>?text=… y toca el botón de
 * enviar buscándolo por su ID de vista (com.whatsapp:id/send), NO por
 * coordenadas. Verifica que el campo de texto quedó vacío (mensaje salió) antes
 * de confirmar — "entregado" honesto. Reemplaza a Tasker+AutoInput para iniciar.
 */
class WaSendService : AccessibilityService() {
    private val h = Handler(Looper.getMainLooper())
    private val TIMEOUT_MS = 25000L

    override fun onServiceConnected() {
        super.onServiceConnected()
        MbLog.init(this)
        MbLog.i("frio", "accesibilidad conectada")
        loop()
    }

    // Loop de 1s: si hay un cold-send pendiente sin lanzar, abre el chat.
    private fun loop() {
        val t = ColdSend.pendiente
        if (t != null && !ColdSend.lanzado) {
            ColdSend.lanzado = true
            MbLog.i("frio", "abriendo chat ${t.numero} (#${t.id})")
            abrirChat(t.numero, t.texto)
            // deadline
            h.postDelayed({
                if (ColdSend.pendiente?.id == t.id) {   // seguía sin resolverse
                    MbLog.w("frio", "timeout #${t.id} — no encontré el botón send")
                    goHome()
                    ColdSend.terminar(t.id, false)       // no se pudo → queda en cola, reintenta
                }
            }, TIMEOUT_MS)
        }
        h.postDelayed({ loop() }, 1000)
    }

    private fun abrirChat(num: String, texto: String) {
        try {
            despertarPantalla()
            val enc = URLEncoder.encode(texto, "UTF-8")
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$num?text=$enc"))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(i)
        } catch (e: Exception) { MbLog.e("frio", "abrirChat: ${e.message}") }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val t = ColdSend.pendiente ?: return
        if (!ColdSend.lanzado) return
        val pkg = event?.packageName?.toString() ?: return
        if (pkg != "com.whatsapp" && pkg != "com.whatsapp.w4b") return

        val root = rootInActiveWindow ?: return
        val send = buscarPorId(root, "$pkg:id/send")
        if (send != null && send.isClickable) {
            MbLog.i("frio", "botón send encontrado — tap")
            send.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            // verificar: tras enviar, el campo de texto queda vacío
            h.postDelayed({ verificarYConfirmar(t.id, pkg) }, 1200)
        }
    }

    private fun verificarYConfirmar(id: String, pkg: String) {
        if (ColdSend.pendiente?.id != id) return
        val root = rootInActiveWindow
        val entry = root?.let { buscarPorId(it, "$pkg:id/entry") }
        val textoEntry = entry?.text?.toString() ?: ""
        val sendSigue = root?.let { buscarPorId(it, "$pkg:id/send") } != null
        val ok = textoEntry.isBlank() || !sendSigue   // se vació o el botón send desapareció
        MbLog.i("frio", "verificación #$id: ${if (ok) "ENVIADO" else "NO se envió (entry='${textoEntry.take(30)}')"}")
        goHome()
        ColdSend.terminar(id, ok)
    }

    private fun buscarPorId(root: AccessibilityNodeInfo, viewId: String): AccessibilityNodeInfo? {
        val l = root.findAccessibilityNodeInfosByViewId(viewId)
        return if (l != null && l.isNotEmpty()) l[0] else null
    }

    private fun goHome() { performGlobalAction(GLOBAL_ACTION_HOME) }

    @Suppress("DEPRECATION")
    private fun despertarPantalla() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "MariaBridge:coldsend")
            wl.acquire(8000)
        } catch (_: Exception) {}
    }

    override fun onInterrupt() {}
}
