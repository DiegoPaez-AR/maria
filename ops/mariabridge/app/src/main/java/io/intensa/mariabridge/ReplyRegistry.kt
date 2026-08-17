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

    /** @return true si la notif tenía acción de Responder (= es un CHAT real). */
    fun registrarDesde(sbnKey: String, titulo: String, n: Notification): Boolean {
        val actions = n.actions ?: return false
        for (a in actions) {
            val ris = a.remoteInputs ?: continue
            for (ri in ris) {
                if (ri.resultKey != null) {
                    porChat[normalizar(titulo)] = Accion(a.actionIntent, ri, null)
                    return true
                }
            }
        }
        return false
    }

    fun titulosVivos(): List<String> = porChat.keys.toList()

    /** Responde al chat que matchee por nombre/número. Flexible: exacto →
     *  contains bidireccional → por dígitos. true si pudo. */
    fun responder(c: Context, buscado: String, texto: String): Boolean {
        val acc = buscarAccion(buscado) ?: return false
        return try {
            val intent = Intent()
            val bundle = Bundle()
            bundle.putCharSequence(acc.remoteInput.resultKey, texto)
            RemoteInput.addResultsToIntent(arrayOf(acc.remoteInput), intent, bundle)
            acc.pending.send(c, 0, intent)
            true
        } catch (e: Exception) { false }
    }

    private fun buscarAccion(buscado: String): Accion? {
        val b = normalizar(buscado)
        porChat[b]?.let { return it }                                   // exacto
        val bDig = b.filter { it.isDigit() }
        for ((k, v) in porChat) {
            if (k.contains(b) || b.contains(k)) return v                // contains bidireccional
            val kDig = k.filter { it.isDigit() }
            if (bDig.length >= 8 && kDig.length >= 8 &&
                (kDig.endsWith(bDig.takeLast(10)) || bDig.endsWith(kDig.takeLast(10)))) return v  // por número
        }
        return null
    }

    private fun normalizar(s: String): String =
        java.text.Normalizer.normalize(s.trim().lowercase(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
}
