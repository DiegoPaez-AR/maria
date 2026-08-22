package io.intensa.mariabridge

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Captura las notificaciones de WhatsApp:
 *  - registra la acción "Responder" del chat (para contestar sin abrir WA)
 *  - POSTea el mensaje entrante al hook del VPS (recibir)
 * Reemplaza a AutoResponder. Requiere el permiso de "acceso a notificaciones".
 */
class NotifListener : NotificationListenerService() {

    private val WA = setOf("com.whatsapp", "com.whatsapp.w4b")

    override fun onCreate() { super.onCreate(); MbLog.init(this); MbLog.i("notif", "listener conectado") }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName !in WA) return
        val extras = sbn.notification.extras ?: return

        val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: return
        if (titulo.isBlank()) return   // notifs redactadas llegan sin título
        // Eco propio: al responder por RemoteInput, WhatsApp re-emite la notif con
        // nuestra respuesta como "You"/"Tú" → NO es un entrante, filtrar.
        val tNorm = titulo.trim().lowercase()
        if (tNorm in setOf("you", "tú", "tu", "vos", "yo")) return
        // Notificaciones de SERVICIO de WhatsApp ("Checking for new messages",
        // backups, llamadas perdidas) — no son mensajes.
        if (tNorm == "whatsapp") return
        var texto = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        // Reacciones ("Reacted ❤️ to ...", "Ulises: Reacted ...") — no son texto
        // útil para el hook; generan turnos basura. Con o sin prefijo de nombre.
        if (Regex("^([^:]{1,40}: )?(Reacted|Reaccionó|Reagiu|Reaccionaste)\\b", RegexOption.IGNORE_CASE).containsMatchIn(texto)) return

        // Contenido redactado por Android ("Sensitive notification content hidden")
        if (texto.contains("notification content hidden", ignoreCase = true)) return
        // DEDUPE (17/8, caso "Gracias María!" x4): WhatsApp re-emite la misma
        // notif al actualizar el grupo → mismo (título,texto) en 10 min = ya visto.
        if (Dedupe.visto(titulo, texto)) { MbLog.i("notif", "dup ignorado de \"$titulo\""); return }
        // Resumen agregado ("3 mensajes nuevos") → ignorar, no es contenido real.
        if (texto.matches(Regex("^\\d+ (mensajes?|messages?).*", RegexOption.IGNORE_CASE))) return
        // Notif de llamada / "escribiendo" / vacías → ignorar.
        if (texto.isBlank()) return
        // Grupos: WhatsApp titula "Grupo" y el texto viene "Fulano: hola". v1 = solo 1a1.
        // (heurística: si el texto tiene "Nombre: " y el título parece grupo, lo dejamos pasar
        //  igual con el título como remitente — el ruteo real lo hace el VPS por número.)

        // Guardar la acción Responder de este chat (clave = título = nombre del
        // contacto). v2.9: si la notif NO tiene botón Responder, NO es un chat
        // (notifs de sistema de WA: "account restricted", backups, llamadas) —
        // filtrarla acá mata todo el ruido de una vez.
        val esChat = ReplyRegistry.registrarDesde(sbn.key, titulo, sbn.notification)
        if (!esChat) { MbLog.i("notif", "sin acción de reply — descarto no-chat: \"${titulo.take(40)}\""); return }

        // Enviar al hook (el VPS resuelve usuario/tercero por nombre+historial)
        val base = Prefs.hookBase(this)
        val secret = Prefs.secret(this)
        if (base.isBlank() || secret.isBlank()) return

        MbLog.i("notif", "entrante de \"$titulo\": ${texto.take(60)}")

        // 7a (2026-08-17): si es un AUDIO y tenemos acceso a archivos, cazamos
        // el .opus de la carpeta de medios y lo subimos → el server transcribe
        // con Whisper y corre el turno con el TEXTO REAL. Si no aparece el
        // archivo o falla, caemos al POST normal (hint "mandámelo en texto").
        val esAudio = texto.contains("🎤") || Regex("mensaje de voz|voice message|^audio\\b", RegexOption.IGNORE_CASE).containsMatchIn(texto)
        val esImagen = texto.contains("📷") || texto.contains("📸") || Regex("^(photo|foto|imagen)\\b", RegexOption.IGNORE_CASE).containsMatchIn(texto)
        val esDoc = texto.contains("📄") || texto.contains(".pdf", ignoreCase = true)
        val esVideo = texto.contains("🎥") || Regex("^(video|vídeo)\\b", RegexOption.IGNORE_CASE).containsMatchIn(texto)
        val tipoMedia = when { esAudio -> "audio"; esImagen -> "imagen"; esDoc -> "documento"; esVideo -> "video"; else -> null }
        if (tipoMedia != null && MediaCaza.tenemosPermiso()) {
            val ts = System.currentTimeMillis()
            Thread {
                try {
                    val f = when (tipoMedia) {
                        "audio" -> MediaCaza.cazarAudio(ts)
                        "imagen" -> MediaCaza.cazarImagen(ts)
                        "video" -> MediaCaza.cazarVideo(ts)
                        else -> MediaCaza.cazarDocumento(ts)
                    }
                    if (f != null) {
                        MbLog.i("media", "$tipoMedia de \"$titulo\" cazado: ${f.name} (${f.length() / 1024}KB) — subiendo")
                        val r = MediaCaza.subir(base, secret, titulo, f, tipoMedia, texto)
                        val okMedia = r != null && (tipoMedia !in listOf("audio", "video") || !r.optString("transcript").isNullOrBlank())
                        if (okMedia) {
                            MbLog.i("media", "$tipoMedia procesado OK")
                            val rs = r!!.optJSONArray("replies")
                            if (rs != null) for (i in 0 until rs.length()) {
                                val m = rs.getJSONObject(i).optString("message")
                                if (m.isNotBlank()) {
                                    val ok = ReplyRegistry.responder(this, titulo, m)
                                    MbLog.i("media", "reply a \"$titulo\": ${if (ok) "ENVIADA" else "FALLÓ"}")
                                    Thread.sleep(1200)
                                }
                            }
                            return@Thread   // media procesada — NO hacemos el POST del hint
                        }
                        // Subida hecha pero sin respuesta útil: el server igual lo
                        // está procesando — NO mandamos el hint (duplicaba el turno
                        // y contradecía la respuesta real, bug 22/8).
                        MbLog.w("media", "$tipoMedia subido pero sin respuesta a tiempo — NO mando hint")
                        return@Thread
                    } else MbLog.w("media", "no apareció el archivo ($tipoMedia) de \"$titulo\" — caigo al hint")
                } catch (e: Exception) { MbLog.e("media", "caza falló: ${e.message}") }
                _postNormal(base, secret, titulo, texto)   // fallback solo si NO se pudo cazar
            }.apply { isDaemon = true }.start()
            return
        }

        _postNormal(base, secret, titulo, texto)
    }

    private fun _postNormal(base: String, secret: String, titulo: String, texto: String) {
        val payload = JSONObject().apply {
            put("query", JSONObject().apply {
                put("sender", titulo)          // nombre del contacto (WA no expone el número en la notif)
                put("message", texto)
                put("isGroup", false)
                put("source", "mariabridge")
            })
        }
        Net.postJson("$base/$secret", payload.toString()) { code, resp ->
            if (code != 200) MbLog.e("notif", "hook devolvió $code: ${resp.take(120)}")
            else {
                // respuestas inline del hook → mandarlas por RemoteInput ya mismo
                try {
                    val rs = org.json.JSONObject(resp).optJSONArray("replies")
                    if (rs != null) for (i in 0 until rs.length()) {
                        val m = rs.getJSONObject(i).optString("message")
                        if (m.isNotBlank()) {
                            val ok = ReplyRegistry.responder(this, titulo, m)
                            MbLog.i("notif", "reply inline a \"$titulo\": ${if (ok) "ENVIADA" else "FALLÓ"}")
                            Thread.sleep(1200)
                        }
                    }
                } catch (e: Exception) { MbLog.e("notif", "parse replies: ${e.message}") }
            }
        }
    }
}
