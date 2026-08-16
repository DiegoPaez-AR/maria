package io.intensa.mariabridge

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Logger unificado: además de logcat, junta las líneas y las postea en lote al
 * VPS (/mblog) cada FLUSH_MS. Así todo el debugging queda en el log de pm2 de
 * Maria con prefijo [MB], sin necesidad de cable/logcat.
 * Fail-safe: cola capada (drop de las más viejas), errores de red ignorados.
 */
object MbLog {
    private val cola = ConcurrentLinkedQueue<String>()
    @Volatile private var ctx: Context? = null
    @Volatile private var corriendo = false
    private const val FLUSH_MS = 10000L
    private const val MAX_COLA = 300

    fun init(c: Context) {
        if (ctx == null) ctx = c.applicationContext
        if (!corriendo) {
            corriendo = true
            Thread {
                while (true) {
                    try { Thread.sleep(FLUSH_MS); flush() } catch (_: Exception) {}
                }
            }.apply { isDaemon = true; name = "mblog-flush" }.start()
        }
    }

    fun i(tag: String, msg: String) = add("I", tag, msg)
    fun w(tag: String, msg: String) = add("W", tag, msg)
    fun e(tag: String, msg: String) = add("E", tag, msg)

    private fun add(lvl: String, tag: String, msg: String) {
        android.util.Log.println(
            if (lvl == "E") android.util.Log.ERROR else android.util.Log.INFO,
            "MariaBridge", "[$tag] $msg")
        val ts = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        cola.add("$ts $lvl [$tag] $msg")
        while (cola.size > MAX_COLA) cola.poll()
    }

    private fun flush() {
        val c = ctx ?: return
        val base = Prefs.hookBase(c); val secret = Prefs.secret(c)
        if (base.isBlank() || secret.isBlank()) return
        val arr = JSONArray()
        while (arr.length() < 80) { val l = cola.poll() ?: break; arr.put(l) }
        if (arr.length() == 0) return
        val ver = try {
            c.packageManager.getPackageInfo(c.packageName, 0).versionName
        } catch (_: Exception) { "?" }
        val body = JSONObject().put("ver", ver).put("lineas", arr)
        Net.postJson("$base/$secret/mblog", body.toString())
    }
}
