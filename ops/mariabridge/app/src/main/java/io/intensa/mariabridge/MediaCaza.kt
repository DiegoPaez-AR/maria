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
    private val BASES = listOf(
        "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media",
        "/storage/emulated/0/WhatsApp/Media",   // layouts viejos
    )
    private val DIRS_AUDIO = BASES.map { "$it/WhatsApp Voice Notes" } + BASES.map { "$it/WhatsApp Audio" }
    private val DIRS_IMG = BASES.map { "$it/WhatsApp Images" }
    private val DIRS_DOC = BASES.map { "$it/WhatsApp Documents" }
    private val DIRS_VIDEO = BASES.map { "$it/WhatsApp Video" }
    private val EXT_AUDIO = listOf(".opus", ".m4a", ".ogg", ".mp3")
    private val EXT_IMG = listOf(".jpg", ".jpeg", ".png", ".webp")
    private val EXT_DOC = listOf(".pdf")
    private val EXT_VIDEO = listOf(".mp4", ".3gp", ".mov")
    private const val TIMEOUT_MS = 12_000L
    private const val FRESCURA_MS = 45_000L      // el archivo debe ser de ahora
    private const val MAX_BYTES = 10 * 1024 * 1024

    fun tenemosPermiso(): Boolean =
        try { Environment.isExternalStorageManager() } catch (_: Exception) { false }

    fun cazarAudio(desdeTs: Long) = _cazar(DIRS_AUDIO, EXT_AUDIO, desdeTs)
    fun cazarImagen(desdeTs: Long) = _cazar(DIRS_IMG, EXT_IMG, desdeTs)
    fun cazarDocumento(desdeTs: Long) = _cazar(DIRS_DOC, EXT_DOC, desdeTs)
    fun cazarVideo(desdeTs: Long) = _cazar(DIRS_VIDEO, EXT_VIDEO, desdeTs)

    /** Busca un archivo NUEVO (mtime dentro de FRESCURA). Espera hasta TIMEOUT. */
    private fun _cazar(dirs: List<String>, exts: List<String>, desdeTs: Long): File? {
        if (!tenemosPermiso()) return null
        val limite = System.currentTimeMillis() + TIMEOUT_MS
        while (System.currentTimeMillis() < limite) {
            val f = _masNuevo(dirs, exts, desdeTs)
            if (f != null) {
                // esperar a que termine de escribirse (tamaño estable)
                val t1 = f.length(); Thread.sleep(700)
                if (f.length() == t1 && t1 > 0) return f
            } else Thread.sleep(800)
        }
        return null
    }

    private fun _masNuevo(dirs: List<String>, exts: List<String>, desdeTs: Long): File? {
        var mejor: File? = null
        for (dir in dirs) {
            val d = File(dir)
            if (!d.isDirectory) continue
            // raíz + subcarpetas por semana (ej. 202633) — las 2 más recientes
            val lugares = mutableListOf(d)
            d.listFiles { x -> x.isDirectory }?.sortedByDescending { it.name }?.take(2)?.let { lugares.addAll(it) }
            for (sub in lugares) {
                sub.listFiles { x -> x.isFile && exts.any { e -> x.name.lowercase().endsWith(e) } && !x.name.startsWith(".") }
                    ?.forEach { f ->
                        if (f.lastModified() >= desdeTs - FRESCURA_MS &&
                            (mejor == null || f.lastModified() > mejor!!.lastModified())) mejor = f
                    }
            }
        }
        return mejor
    }

    /** Sube el audio a /mbmedia. Devuelve el JSON de respuesta o null. */
    fun subir(base: String, secret: String, sender: String, f: File, tipo: String = "audio", caption: String = ""): JSONObject? {
        return try {
            if (f.length() > MAX_BYTES) { MbLog.w("media", "$tipo ${f.length() / 1024}KB > cap, no subo"); return null }
            val b64 = Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
            val body = JSONObject().put("sender", sender).put("fileName", f.name).put("data", b64)
                .put("tipo", tipo).put("caption", caption)
            var resultado: JSONObject? = null
            val lock = Object()
            // 240s: transcripción (whisper) + turno completo del LLM pueden pasar
            // los 90s por default — el timeout hacía que la app cayera al hint y
            // el usuario recibiera "no puedo escuchar audios" DESPUÉS de la
            // respuesta real (bug 22/8).
            Net.postJson("$base/$secret/mbmedia", body.toString(), 240000) { code, resp ->
                synchronized(lock) {
                    resultado = if (code == 200) try { JSONObject(resp) } catch (_: Exception) { null } else null
                    lock.notifyAll()
                }
            }
            synchronized(lock) { lock.wait(250_000) }
            resultado
        } catch (e: Exception) { MbLog.e("media", "subida falló: ${e.message}"); null }
    }
}
