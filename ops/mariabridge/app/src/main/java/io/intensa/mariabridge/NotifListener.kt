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
        var texto = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

        // Resumen agregado ("3 mensajes nuevos") → ignorar, no es contenido real.
        if (texto.matches(Regex("^\\d+ (mensajes?|messages?).*", RegexOption.IGNORE_CASE))) return
        // Notif de llamada / "escribiendo" / vacías → ignorar.
        if (texto.isBlank()) return
        // Grupos: WhatsApp titula "Grupo" y el texto viene "Fulano: hola". v1 = solo 1a1.
        // (heurística: si el texto tiene "Nombre: " y el título parece grupo, lo dejamos pasar
        //  igual con el título como remitente — el ruteo real lo hace el VPS por número.)

        // Guardar la acción Responder de este chat (clave = título = nombre del contacto)
        ReplyRegistry.registrarDesde(sbn.key, titulo, sbn.notification)

        // Enviar al hook (el VPS resuelve usuario/tercero por nombre+historial)
        val base = Prefs.hookBase(this)
        val secret = Prefs.secret(this)
        if (base.isBlank() || secret.isBlank()) return

        MbLog.i("notif", "entrante de \"$titulo\": ${texto.take(60)}")
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
