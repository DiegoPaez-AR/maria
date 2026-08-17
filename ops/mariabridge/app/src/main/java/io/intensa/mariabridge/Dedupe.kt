package io.intensa.mariabridge

/** Dedupe de notificaciones re-emitidas: mismo (título|texto) en TTL = visto. */
object Dedupe {
    private val vistos = LinkedHashMap<Int, Long>()
    private const val TTL_MS = 10 * 60_000L

    @Synchronized fun visto(titulo: String, texto: String): Boolean {
        val ahora = System.currentTimeMillis()
        val it = vistos.entries.iterator()
        while (it.hasNext()) if (ahora - it.next().value > TTL_MS) it.remove()
        val h = (titulo.trim() + "|" + texto.trim()).hashCode()
        if (vistos.containsKey(h)) return true
        vistos[h] = ahora
        while (vistos.size > 200) vistos.remove(vistos.keys.first())
        return false
    }
}
