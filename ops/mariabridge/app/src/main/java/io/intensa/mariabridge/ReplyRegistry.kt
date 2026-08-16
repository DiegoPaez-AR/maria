package io.intensa.mariabridge

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.app.RemoteInput

/**
 * Guarda, por chat de WhatsApp, la última acción "Responder" viva (su
 * PendingIntent + el RemoteInput). Con eso podemos contestar EN SEGUNDO PLANO,
 * sin abrir WhatsApp ni tocar la pantalla (RemoteInput sobre la notificación).
 * Solo funciona mientras la notificación del chat siga activa — para chats sin
 * notificación viva (iniciar en frío) se usa el fallback de Accesibilidad (v2).
 */
object ReplyRegistry {
    data class Accion(val pending: PendingIntent, val remoteInput: RemoteInput, val actionIntent: Intent?)

    private val porChat = HashMap<String, Accion>()

    fun registrarDesde(sbnKey: String, titulo: String, n: Notification) {
        val actions = n.actions ?: return
        for (a in actions) {
            val ris = a.remoteInputs ?: continue
            for (ri in ris) {
                if (ri.resultKey != null) {
                    porChat[normalizar(titulo)] = Accion(a.actionIntent, ri, null)
                    return
                }
            }
        }
    }

    /** Responde al chat cuyo título (nombre del contacto) matchee. true si pudo. */
    fun responder(c: Context, nombreChat: String, texto: String): Boolean {
        val acc = porChat[normalizar(nombreChat)] ?: return false
        return try {
            val intent = Intent()
            val bundle = Bundle()
            bundle.putCharSequence(acc.remoteInput.resultKey, texto)
            RemoteInput.addResultsToIntent(arrayOf(acc.remoteInput), intent, bundle)
            acc.pending.send(c, 0, intent)
            true
        } catch (e: Exception) { false }
    }

    fun tieneChat(nombreChat: String) = porChat.containsKey(normalizar(nombreChat))

    private fun normalizar(s: String) = s.trim().lowercase()
}
