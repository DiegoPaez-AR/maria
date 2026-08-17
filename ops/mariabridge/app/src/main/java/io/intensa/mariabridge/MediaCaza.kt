package io.intensa.mariabridge

import android.os.Environment
import android.util.Base64
import org.json.JSONObject
import java.io.File

/**
 * Caza de medios de WhatsApp (7a, 2026-08-17): cuando llega la notificación de
 * un AUDIO, WhatsApp lo auto-descarga a su carpeta pública de medios. Con el
 * permiso "All files access" podemos leerla, encontrar el archivo nuevo y
 * subirlo al VPS para transcribir con Whisper. Fallback: si no aparece en
 * TIMEOUT_MS, el llamador cae al hint de siempre ("mandámelo en texto").
 */
object MediaCaza {
    private val DIRS_AUDIO = listOf(
        "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes",
        "/storage/emulated/0/WhatsApp/Media/WhatsApp Voice Notes",   // layouts viejos
    )
    private const val TIMEOUT_MS = 12_000L
    private const val FRESCURA_MS = 45_000L      // el archivo debe ser de ahora
    private const val MAX_BYTES = 6 * 1024 * 1024

    fun tenemosPermiso(): Boolean =
        try { Environment.isExternalStorageManager() } catch (_: Exception) { false }

    /** Busca un audio NUEVO (mtime dentro de FRESCURA). Espera hasta TIMEOUT. */
    fun cazarAudio(desdeTs: Long): File? {
        if (!tenemosPermiso()) return null
        val limite = System.currentTimeMillis() + TIMEOUT_MS
        while (System.currentTimeMillis() < limite) {
            val f = _masNuevo(desdeTs)
            if (f != null) {
                // esperar a que termine de escribirse (tamaño estable)
                val t1 = f.length(); Thread.sleep(700)
                if (f.length() == t1 && t1 > 0) return f
            } else Thread.sleep(800)
        }
        return null
    }

    private fun _masNuevo(desdeTs: Long): File? {
        var mejor: File? = null
        for (dir in DIRS_AUDIO) {
            val d = File(dir)
            if (!d.isDirectory) continue
            // subcarpetas por semana (ej. 202633) — mirar las 2 más recientes
            val subs = d.listFiles { x -> x.isDirectory }?.sortedByDescending { it.name }?.take(2) ?: continue
            for (sub in subs) {
                sub.listFiles { x -> x.isFile && (x.name.endsWith(".opus") || x.name.endsWith(".m4a") || x.name.endsWith(".ogg")) }
                    ?.forEach { f ->
                        if (f.lastModified() >= desdeTs - FRESCURA_MS &&
                            (mejor == null || f.lastModified() > mejor!!.lastModified())) mejor = f
                    }
            }
        }
        return mejor
    }

    /** Sube el audio a /mbmedia. Devuelve el JSON de respuesta o null. */
    fun subir(base: String, secret: String, sender: String, f: File): JSONObject? {
        return try {
            if (f.length() > MAX_BYTES) { MbLog.w("media", "audio ${f.length() / 1024}KB > cap, no subo"); return null }
            val b64 = Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
            val body = JSONObject().put("sender", sender).put("fileName", f.name).put("data", b64)
            var resultado: JSONObject? = null
            val lock = Object()
            Net.postJson("$base/$secret/mbmedia", body.toString()) { code, resp ->
                synchronized(lock) {
                    resultado = if (code == 200) try { JSONObject(resp) } catch (_: Exception) { null } else null
                    lock.notifyAll()
                }
            }
            synchronized(lock) { lock.wait(120_000) }
            resultado
        } catch (e: Exception) { MbLog.e("media", "subida falló: ${e.message}"); null }
    }
}
