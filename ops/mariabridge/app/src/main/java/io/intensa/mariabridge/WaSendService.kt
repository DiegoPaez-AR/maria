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
 * Envío EN FRÍO por accesibilidad: abre whatsapp://send?phone=… y toca el botón
 * de enviar buscándolo por su ID de vista (com.whatsapp:id/send), NO por
 * coordenadas. Verifica el envío con EVIDENCIA POSITIVA (v4.7, caso Walby 5/9:
 * el tap no prendió, el texto quedó en el cuadro y aun así dijimos "ENVIADO"
 * porque la lectura de 1,2s vino con root null → entry "" → ok). Ahora:
 *   A) hasta 3 lecturas (1,2s / 3s / 6s): ENVIADO solo si entry EXISTE y está
 *      vacío Y el texto aparece como burbuja fuera del entry; si el texto sigue
 *      en el entry con send visible → un re-tap en el lugar; root null / entry
 *      ausente = INCONCLUSO, nunca OK.
 *   B) si no hubo veredicto → screenshot al VPS (/mbverif) y lo mira un modelo
 *      con visión: enviado | trabado | otro. Trabado → mbfallo y el server lo
 *      re-sirve UNA vez (reabre el chat con el borrador y toca send de nuevo).
 * "Entregado" honesto. Reemplaza a Tasker+AutoInput para iniciar.
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
                // v4.7: si el tap ya se hizo, la verificación es dueña del cierre
                // (antes el deadline podía pisarla y reportar timeout_sin_boton)
                if (ColdSend.pendiente?.id == t.id && ColdSend.tapHecho != t.id) {   // seguía sin resolverse
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
        // Batería (auditoría): 1s solo si hay un cold-send en curso; si no, 5s.
        h.postDelayed({ loop() }, if (ColdSend.pendiente != null) 1000 else 5000)
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

    // v4.4: el botón "Update" del instalador NO aparece en rootInActiveWindow
    // (lección 11: solo se ve "Cancel"). Miramos TODAS las ventanas visibles y,
    // si aun así no aparece, tocamos por geometría el espejo de Cancel.
    @Volatile private var _ventanaEspejo = 0L
    @Volatile private var _intentosEspejo = 0
    @Volatile private var _ultimoEspejo = 0L
    @Volatile private var _ultimoLogInstalador = 0L

    private fun _rootsVisibles(): List<AccessibilityNodeInfo> {
        val out = mutableListOf<AccessibilityNodeInfo>()
        try { rootInActiveWindow?.let { out.add(it) } } catch (_: Exception) {}
        try {
            for (w in windows) {
                val r = try { w.root } catch (_: Exception) { null } ?: continue
                if (out.none { it == r }) out.add(r)
            }
        } catch (_: Exception) {}
        return out
    }

    private fun _autoInstalarTodo(): Boolean {
        val roots = _rootsVisibles()
        if (roots.isEmpty()) return false
        for (r in roots) if (_autoInstalar(r)) return true
        if (!Updater.enVentanaInstalacion()) return false
        // Plan B geométrico, con tope: 3 intentos por ventana de instalación
        // y 8s entre toques (nunca martillar — lección 5).
        if (Updater.instalandoDesde != _ventanaEspejo) { _ventanaEspejo = Updater.instalandoDesde; _intentosEspejo = 0 }
        val ahora = System.currentTimeMillis()
        if (_intentosEspejo >= 3 || ahora - _ultimoEspejo < 8000) return false
        for (r in roots) {
            if (_tapEspejoDeCancel(r)) { _ultimoEspejo = ahora; _intentosEspejo++; return true }
        }
        return false
    }

    private fun _tapEspejoDeCancel(root: AccessibilityNodeInfo): Boolean {
        val cancelar = listOf("cancel", "cancelar", "cancelar ")
        for (n in _todosLosNodos(root)) {
            val tt = (n.text?.toString() ?: n.contentDescription?.toString() ?: "").trim().lowercase()
            if (tt !in cancelar) continue
            var c: AccessibilityNodeInfo? = n; var saltos = 0
            while (c != null && !c.isClickable && saltos < 6) { c = c.parent; saltos++ }
            val nodo = c ?: n
            val r = android.graphics.Rect(); nodo.getBoundsInScreen(r)
            val ancho = resources.displayMetrics.widthPixels
            if (ancho <= 0) return false
            val x = (ancho - r.centerX()).coerceIn(8, ancho - 8)
            val y = r.centerY()
            if (kotlin.math.abs(x - r.centerX()) < 60) {
                MbLog.w("upd", "Cancel está centrado ($x vs ${r.centerX()}) — sin espejo confiable, no toco")
                return false
            }
            MbLog.i("upd", "0-tap plan B: 'Update' no está en el árbol — toco el espejo de Cancel en $x,$y (intento ${_intentosEspejo + 1}/3)")
            val path = android.graphics.Path().apply { moveTo(x.toFloat(), y.toFloat()) }
            val g = android.accessibilityservice.GestureDescription.Builder()
                .addStroke(android.accessibilityservice.GestureDescription.StrokeDescription(path, 0, 60)).build()
            val ok = dispatchGesture(g, null, null)
            if (!ok) MbLog.w("upd", "dispatchGesture rechazado en el plan B")
            return ok
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
        val ahoraLog = System.currentTimeMillis()
        if (ahoraLog - _ultimoLogInstalador > 5000) {
            _ultimoLogInstalador = ahoraLog
            MbLog.i("upd", "instalador visible — ventana=${enVentana} clickables=${botones.joinToString(",").take(200)}")
        }
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
            _autoInstalarTodo()
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
            val largo = ColdSend.pendiente?.texto?.length ?: 60
            val pausa = (3000L + largo * 60L).coerceAtMost(20000L)
            MbLog.i("frio", "botón send encontrado — 'escribiendo' ${pausa / 1000}s antes de enviar")
            try { Thread.sleep(pausa) } catch (_: Exception) {}
            ColdSend.tapHecho = t.id
            send.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            // verificar con evidencia positiva (v4.7): 3 lecturas, re-tap, foto
            h.postDelayed({ verificarYConfirmar(t.id, pkg, 1) }, 1200)
        }
    }

    // ── Verificación positiva (v4.7) ────────────────────────────────────────
    // Devuelve "enviado" | "trabado" | "inconcluso" mirando la pantalla UNA vez.
    private fun _leerEstadoEnvio(pkg: String, texto: String): String {
        val root = rootInActiveWindow ?: return "inconcluso"
        val entry = buscarPorId(root, "$pkg:id/entry") ?: return "inconcluso"
        val textoEntry = entry.text?.toString() ?: ""
        val firma = texto.trim().lineSequence().firstOrNull()?.trim()?.take(40) ?: ""
        if (textoEntry.isNotBlank()) {
            // el texto sigue en el cuadro → no salió (si es OTRO texto, raro: inconcluso)
            return if (firma.isNotBlank() && textoEntry.trim().startsWith(firma.take(20))) "trabado" else "inconcluso"
        }
        // entry vacío: exigimos ver el mensaje como burbuja (nodo con el texto,
        // distinto del entry). WhatsApp usa message_text; buscamos por texto
        // porque el id varía entre versiones.
        if (firma.isBlank()) return "inconcluso"
        val nodos = root.findAccessibilityNodeInfosByText(firma) ?: emptyList()
        val burbuja = nodos.any { n ->
            val idv = n.viewIdResourceName ?: ""
            !idv.endsWith("/entry") && (n.text?.toString() ?: "").contains(firma.take(20))
        }
        return if (burbuja) "enviado" else "inconcluso"
    }

    @Volatile private var _reTapHecho: String? = null

    private fun verificarYConfirmar(id: String, pkg: String, intento: Int) {
        val t = ColdSend.pendiente ?: return
        if (t.id != id) return
        val estado = try { _leerEstadoEnvio(pkg, t.texto) } catch (e: Exception) { MbLog.w("frio", "lectura #$id: ${e.message}"); "inconcluso" }
        MbLog.i("frio", "verificación #$id lectura $intento/3: $estado")
        if (estado == "enviado") {
            MbLog.i("frio", "verificación #$id: ENVIADO (burbuja visible)")
            goHome(); ColdSend.terminar(id, true); return
        }
        if (estado == "trabado" && _reTapHecho != id) {
            // el tap no prendió (caso Walby): UN re-tap en el lugar, sin reabrir
            val root = rootInActiveWindow
            val send = root?.let { buscarPorId(it, "$pkg:id/send") }
            if (send != null && send.isClickable) {
                _reTapHecho = id
                MbLog.w("frio", "#$id: texto sigue en el cuadro — re-tap del send (1 vez)")
                send.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                h.postDelayed({ verificarYConfirmar(id, pkg, intento) }, 1500)
                return
            }
        }
        if (intento < 3) {
            h.postDelayed({ verificarYConfirmar(id, pkg, intento + 1) }, if (intento == 1) 1800L else 3000L)
            return
        }
        // Capa B: sin veredicto por el árbol → foto al VPS y que la mire un modelo
        MbLog.w("frio", "#$id: sin veredicto por accesibilidad ($estado) — mando foto al VPS")
        _verificarPorFoto(id, estado)
    }

    private fun _verificarPorFoto(id: String, estadoArbol: String) {
        val base = Prefs.hookBase(this); val secret = Prefs.secret(this)
        val t = ColdSend.pendiente
        if (base.isBlank() || t == null || t.id != id) { _cerrarSinVeredicto(id, estadoArbol); return }
        if (android.os.Build.VERSION.SDK_INT < 30) { _cerrarSinVeredicto(id, estadoArbol); return }
        // deadline propio: si la foto o el VPS no responden en 60s, cerramos igual
        val cerrado = java.util.concurrent.atomic.AtomicBoolean(false)
        h.postDelayed({ if (cerrado.compareAndSet(false, true)) { MbLog.w("frio", "#$id: foto/VPS sin respuesta — cierro inconcluso"); _cerrarSinVeredicto(id, estadoArbol) } }, 60000)
        try {
            takeScreenshot(android.view.Display.DEFAULT_DISPLAY, { it.run() },
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(sr: AccessibilityService.ScreenshotResult) {
                        try {
                            val bmp = android.graphics.Bitmap.wrapHardwareBuffer(sr.hardwareBuffer, sr.colorSpace)
                            val soft = bmp?.copy(android.graphics.Bitmap.Config.ARGB_8888, false)
                            sr.hardwareBuffer.close()
                            if (soft == null) { if (cerrado.compareAndSet(false, true)) _cerrarSinVeredicto(id, estadoArbol); return }
                            val chico = android.graphics.Bitmap.createScaledBitmap(soft, soft.width / 2, soft.height / 2, true)
                            val bos = java.io.ByteArrayOutputStream()
                            chico.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, bos)
                            val b64 = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP)
                            val body = org.json.JSONObject().put("id", id).put("estado_arbol", estadoArbol)
                                .put("numero", t.numero).put("nombre", t.nombre).put("texto", t.texto.take(300)).put("data", b64)
                            Net.postJson("$base/$secret/mbverif", body.toString(), 90000) { code, resp ->
                                if (!cerrado.compareAndSet(false, true)) return@postJson
                                val veredicto = try { org.json.JSONObject(resp).optString("veredicto", "otro") } catch (_: Exception) { "otro" }
                                MbLog.i("frio", "#$id: veredicto por foto = $veredicto (http $code)")
                                h.post { _cerrarConVeredicto(id, veredicto) }
                            }
                        } catch (e: Exception) {
                            MbLog.w("frio", "#$id foto: ${e.message}")
                            if (cerrado.compareAndSet(false, true)) h.post { _cerrarSinVeredicto(id, estadoArbol) }
                        }
                    }
                    override fun onFailure(code: Int) {
                        MbLog.w("frio", "#$id screenshot falló code=$code")
                        if (cerrado.compareAndSet(false, true)) h.post { _cerrarSinVeredicto(id, estadoArbol) }
                    }
                })
        } catch (e: Exception) {
            MbLog.w("frio", "#$id takeScreenshot: ${e.message}")
            if (cerrado.compareAndSet(false, true)) _cerrarSinVeredicto(id, estadoArbol)
        }
    }

    private fun _cerrarConVeredicto(id: String, veredicto: String) {
        if (ColdSend.pendiente?.id != id) return
        when (veredicto) {
            "enviado" -> { MbLog.i("frio", "verificación #$id: ENVIADO (por foto)"); goHome(); ColdSend.terminar(id, true) }
            "trabado" -> { MbLog.w("frio", "verificación #$id: TRABADO (por foto) — el server lo re-sirve 1 vez"); _reportarFallo(id, "trabado_foto"); goHome(); ColdSend.terminar(id, false) }
            else -> { MbLog.w("frio", "verificación #$id: sin veredicto por foto — NO confirmo"); _reportarFallo(id, "verificacion_inconclusa"); goHome(); ColdSend.terminar(id, false) }
        }
    }

    private fun _cerrarSinVeredicto(id: String, estadoArbol: String) {
        if (ColdSend.pendiente?.id != id) return
        MbLog.w("frio", "verificación #$id: NO confirmo ($estadoArbol, sin foto)")
        _reportarFallo(id, if (estadoArbol == "trabado") "trabado_foto" else "verificacion_inconclusa")
        goHome(); ColdSend.terminar(id, false)
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
