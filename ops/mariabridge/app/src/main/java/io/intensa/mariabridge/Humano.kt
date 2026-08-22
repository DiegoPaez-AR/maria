package io.intensa.mariabridge

/**
 * Pausas "humanas" centralizadas (v4.3). Antes estaban inline dentro de
 * callbacks de red, lo que bloqueaba el pool y hacía vencer el lease del
 * outbox (doble envío). Acá quedan explícitas y en un solo lugar.
 */
object Humano {
    /** Espera proporcional al largo del texto, con jitter. Máx 25s. */
    fun pausar(largoTexto: Int, quien: String = "") {
        val pausa = (4000L + largoTexto * 40L + (0..6000).random()).coerceAtMost(25_000L)
        MbLog.i("humano", "espero ${pausa / 1000}s antes de responder${if (quien.isNotBlank()) " a \"$quien\"" else ""}")
        try { Thread.sleep(pausa) } catch (_: Exception) {}
    }
}
