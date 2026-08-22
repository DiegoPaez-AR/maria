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

    companion object { @Volatile var instancia: WaSendService? = null }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instancia = this
        MbLog.init(this)
        MbLog.i("frio", "accesibilidad conectada")
        loop()
    }

    override fun onDestroy() { if (instancia === this) instancia = null; super.onDestroy() }

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
                    // Radiografía (v3.5, 18/8: TODOS los fríos fallan con "sin botón"
                    // — ¿WhatsApp cambió el viewId del send?): listar ids y textos
                    // clickables de la pantalla para ver qué hay realmente.
                    try {
                        val r = rootInActiveWindow
                        if (r != null) {
                            val vistos = _todosLosNodos(r).filter { it.isClickable }.mapNotNull { n ->
                                val id = n.viewIdResourceName?.substringAfterLast('/') ?: ""
                                val tx = (n.text ?: n.contentDescription ?: "").toString().take(15)
                                if (id.isNotBlank() || tx.isNotBlank()) "$id:$tx" else null
                            }.joinToString(",").take(250)
                            MbLog.w("frio", "pantalla al timeout: [$vistos]")
                        } else MbLog.w("frio", "pantalla al timeout: root NULL")
                    } catch (e: Exception) { MbLog.e("frio", "radiografía: ${e.message}") }
                    MbLog.w("frio", "timeout #${t.id} — no encontré el botón send")
                    // Auto-captura (v3.6): subir screenshot del fallo para diagnóstico
                    try { ControlOps.ejecutar(this, Prefs.hookBase(this), Prefs.secret(this), "auto-${t.id}", "shot", org.json.JSONObject()) } catch (_: Exception) {}
                    _reportarFallo(t.id, "timeout_sin_boton")
                    goHome()
                    ColdSend.terminar(t.id, false)       // el server decide si reintenta (tope 5)
                }
            }, TIMEOUT_MS)
        }
        h.postDelayed({ loop() }, 1000)
    }

    // Tope global de aperturas de chat (v3.7, 18/8: dos revisiones de Meta por
    // martilleo). Ninguna cascada de bugs puede volver a abrir 300 chats.
    private val aperturas = ArrayDeque<Long>()
    private val TOPE_HORA = 12

    private fun _topeOk(): Boolean {
        val ahora = System.currentTimeMillis()
        while (aperturas.isNotEmpty() && ahora - aperturas.first() > 3_600_000L) aperturas.removeFirst()
        if (aperturas.size >= TOPE_HORA) {
            MbLog.w("frio", "TOPE de ${TOPE_HORA} aperturas/hora alcanzado — no abro más chats por ahora")
            return false
        }
        aperturas.addLast(ahora)
        return true
    }

    private fun abrirChat(num: String, texto: String) {
        try {
            if (!_topeOk()) { ColdSend.pendiente?.let { _reportarFallo(it.id, "tope_aperturas"); goHome(); ColdSend.terminar(it.id, false) }; return }
            despertarPantalla()
            // v4.0: whatsapp://send es el PRIMARIO. Sigue SIN wa.me (nada de
            // telemetría a Meta), pero a diferencia de smsto: NO depende de que
            // el número esté en la agenda del teléfono — smsto: mostraba
            // "Invite/SMS" para contactos no agendados aunque tuvieran WhatsApp
            // (caso Catalino 22/8).
            val uri = Uri.parse("whatsapp://send?phone=$num&text=" + URLEncoder.encode(texto, "UTF-8"))
            val i = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage("com.whatsapp")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                startActivity(i)
            } catch (e: Exception) {
                MbLog.w("frio", "whatsapp://send falló (${e.message}) — fallback smsto:")
                val alt = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:+$num")).apply {
                    setPackage("com.whatsapp"); putExtra("sms_body", texto); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(alt)
            }
        } catch (e: Exception) { MbLog.e("frio", "abrirChat: ${e.message}") }
    }

    private val SIN_WA = listOf(
        "no está en whatsapp", "isn't on whatsapp", "is not on whatsapp",
        "não está no whatsapp", "no esta en whatsapp",
        // pantalla de invitación (v4.0): aparece cuando el chat no se pudo abrir
        "invite to whatsapp", "invitar a whatsapp")

    private fun _esDialogoSinWA(root: AccessibilityNodeInfo): Boolean {
        for (frase in listOf("WhatsApp")) {
            val nodos = root.findAccessibilityNodeInfosByText(frase) ?: continue
            for (n in nodos) {
                val txt = n.text?.toString()?.lowercase() ?: continue
                if (SIN_WA.any { txt.contains(it) }) return true
            }
        }
        return false
    }

    // Auto-instalación de updates (v2.6): cuando NUESTRO APK está en ventana de
    // instalación, tocamos Instalar/Actualizar/Listo solos. Guard: SOLO dentro
    // de la ventana de 10min que abre Updater — jamás tocamos installs ajenos.
    private fun _autoInstalar(root: AccessibilityNodeInfo): Boolean {
        // Debug 0-tap (v3.2): loguear SIEMPRE que vemos al instalador, con
        // estado de ventana y botones — para cruzar con el video de Diego.
        val enVentana = Updater.enVentanaInstalacion()
        val botones = mutableListOf<String>()
        _todosLosNodos(root).forEach { n ->
            if (n.isClickable) {
                val tt = n.text?.toString() ?: n.contentDescription?.toString() ?: ""
                if (tt.isNotBlank()) botones.add("${tt.take(20)}[${(n.className ?: "").toString().substringAfterLast('.')}]")
            }
        }
        MbLog.i("upd", "instalador visible — ventana=${enVentana} clickables=${botones.joinToString(",").take(200)}")
        if (!enVentana) return false
        // v3.4 (logs del video de Diego): el botón "Update" NO expone su texto
        // en el nodo clickable (el texto vive en un hijo TextView). Buscamos el
        // TEXTO donde esté y clickeamos su ANCESTRO clickable más cercano.
        val objetivos = listOf("instalar", "install", "actualizar", "update", "listo", "done", "abrir", "open")
        for (n in _todosLosNodos(root)) {
            val tt = (n.text?.toString() ?: n.contentDescription?.toString() ?: "").trim().lowercase()
            if (tt !in objetivos) continue
            // ancestro clickable (o el propio nodo)
            var c: AccessibilityNodeInfo? = n
            var saltos = 0
            while (c != null && !c.isClickable && saltos < 6) { c = c.parent; saltos++ }
            if (c != null && c.isClickable) {
                MbLog.i("upd", "auto-tap '$tt' (ancestro clickable a $saltos salto(s))")
                c.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (tt in listOf("listo", "done", "abrir", "open")) Updater.instalandoDesde = 0L
                return true
            } else {
                MbLog.w("upd", "texto '$tt' visto pero SIN ancestro clickable en 6 saltos")
            }
        }
        return false
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg0 = event?.packageName?.toString() ?: return
        if (pkg0.contains("packageinstaller")) {
            val r = rootInActiveWindow ?: return
            _autoInstalar(r)
            return
        }
        val t = ColdSend.pendiente ?: return
        if (!ColdSend.lanzado) return
        val pkg = pkg0
        if (pkg != "com.whatsapp" && pkg != "com.whatsapp.w4b") return

        val root = rootInActiveWindow ?: return
        // VERIFICACIÓN DE CHAT (v3.0, caso campaña desviada 17/8): antes de
        // tocar enviar, el título de la conversación abierta tiene que ser el
        // DESTINATARIO (nombre esperado o número). Si es otro chat, ABORTAMOS.
        if (!_chatCorrecto(root, t)) return
        // Número SIN WhatsApp (v2.5, caso Carolina): wa.me muestra un diálogo
        // "el número no está en WhatsApp" → fail-fast definitivo, sin reintentos.
        if (_esDialogoSinWA(root)) {
            MbLog.w("frio", "#${t.id}: número ${t.numero} NO está en WhatsApp — reporto y abandono")
            _reportarFallo(t.id, "numero_sin_whatsapp")
            goHome()
            ColdSend.terminar(t.id, false)
            return
        }
        val send = buscarPorId(root, "$pkg:id/send")
        if (send != null && send.isClickable) {
            // TYPING SIMULADO (v4.2): una persona tarda en escribir. Esperamos
            // un tiempo proporcional al largo antes de tocar enviar (5-20s) en
            // vez de disparar al instante (firma de bot).
            val t = ColdSend.pendiente
            val pausa = (3000L + (t?.texto?.length ?: 60) * 60L).coerceAtMost(20000L)
            MbLog.i("frio", "botón send encontrado — 'escribiendo' ${pausa / 1000}s antes de enviar")
            try { Thread.sleep(pausa) } catch (_: Exception) {}
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
        if (!ok) _reportarFallo(id, "verificacion_negativa")
        goHome()
        ColdSend.terminar(id, ok)
    }

    private fun _chatCorrecto(root: AccessibilityNodeInfo, t: ColdSend.Target): Boolean {
        val nodos = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/conversation_contact_name")
        if (nodos == null || nodos.isEmpty()) return true   // pantalla intermedia (aún sin chat) — seguir esperando
        val visto = nodos[0].text?.toString()?.trim()?.lowercase() ?: return true
        val esperadoNombre = t.nombre.trim().lowercase()
        val dEsperado = _dig9(t.numero)
        val dVisto = _dig9(visto)
        // v3.1: match por PALABRAS (subset de tokens en cualquier dirección):
        // "diego" ✓ "diego paez"; DB "Natali Funez" ✓ agenda "Natali Funez";
        // un chat ajeno no comparte tokens → jamás pasa. O match por número.
        fun toks(x: String) = x.split(Regex("\\s+")).filter { it.length >= 2 }.toSet()
        val tv = toks(visto); val te = toks(esperadoNombre)
        val nombreOk = esperadoNombre.isNotBlank() && te.isNotEmpty() && tv.isNotEmpty() &&
                       (tv.containsAll(te) || te.containsAll(tv))
        val ok = nombreOk || (dVisto.length >= 10 && dVisto.takeLast(10) == dEsperado.takeLast(10))
        if (!ok) {
            MbLog.e("frio", "#${t.id}: chat ABIERTO ES OTRO (\"$visto\" ≠ \"${t.nombre}\"/${t.numero}) — ABORTO sin tocar")
            _reportarFallo(t.id, "chat_equivocado")
            goHome()
            ColdSend.terminar(t.id, false)
        }
        return ok
    }

    private fun _dig9(s: String): String {
        var d = s.filter { it.isDigit() }
        if (d.startsWith("549")) d = "54" + d.substring(3)
        return d
    }

    private fun _reportarFallo(id: String, motivo: String) {
        val base = Prefs.hookBase(this); val secret = Prefs.secret(this)
        if (base.isBlank()) return
        val body = org.json.JSONObject().put("id", id).put("motivo", motivo)
        Net.postJson("$base/$secret/mbfallo", body.toString())
    }

    private fun _todosLosNodos(root: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
        val out = mutableListOf<AccessibilityNodeInfo>()
        fun rec(n: AccessibilityNodeInfo?, prof: Int) {
            if (n == null || prof > 12) return
            out.add(n)
            for (i in 0 until n.childCount) rec(n.getChild(i), prof + 1)
        }
        rec(root, 0)
        return out
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
