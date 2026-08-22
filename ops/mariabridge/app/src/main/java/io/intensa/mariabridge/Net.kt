package io.intensa.mariabridge

import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object Net {
    private val pool = Executors.newFixedThreadPool(2)

    // readTimeout 90s (v2.4): el server puede tardar lo que tarde el turno del
    // LLM — ahora el cliente es nuestro y el deadline lo decidimos nosotros.
    // 1 reintento automático ante timeout/red (los POST son idempotentes del
    // lado del hook: dedupe por contenido+turno).
    fun postJson(url: String, body: String, timeoutMs: Int = 90000, onResult: ((Int, String) -> Unit)? = null) {
        pool.execute {
            var intento = 0
            while (intento < 2) {
                try {
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.requestMethod = "POST"
                    c.connectTimeout = 15000; c.readTimeout = timeoutMs
                    c.doOutput = true
                    c.setRequestProperty("Content-Type", "application/json")
                    c.outputStream.use { it.write(body.toByteArray()) }
                    val code = c.responseCode
                    val resp = (if (code in 200..299) c.inputStream else c.errorStream)
                        ?.bufferedReader()?.readText() ?: ""
                    onResult?.invoke(code, resp)
                    c.disconnect()
                    return@execute
                } catch (e: Exception) {
                    intento++
                    if (intento >= 2) { onResult?.invoke(-1, e.message ?: "err"); return@execute }
                    try { Thread.sleep(3000) } catch (_: Exception) {}
                }
            }
        }
    }

    fun get(url: String, onResult: (Int, String) -> Unit) {
        pool.execute {
            try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.requestMethod = "GET"; c.connectTimeout = 15000; c.readTimeout = 30000
                val code = c.responseCode
                val resp = (if (code in 200..299) c.inputStream else c.errorStream)
                    ?.bufferedReader()?.readText() ?: ""
                onResult(code, resp); c.disconnect()
            } catch (e: Exception) { onResult(-1, e.message ?: "err") }
        }
    }
}
