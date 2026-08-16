package io.intensa.mariabridge

import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object Net {
    private val pool = Executors.newFixedThreadPool(2)

    fun postJson(url: String, body: String, onResult: ((Int, String) -> Unit)? = null) {
        pool.execute {
            try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.requestMethod = "POST"
                c.connectTimeout = 15000; c.readTimeout = 20000
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toByteArray()) }
                val code = c.responseCode
                val resp = (if (code in 200..299) c.inputStream else c.errorStream)
                    ?.bufferedReader()?.readText() ?: ""
                onResult?.invoke(code, resp)
                c.disconnect()
            } catch (e: Exception) { onResult?.invoke(-1, e.message ?: "err") }
        }
    }

    fun get(url: String, onResult: (Int, String) -> Unit) {
        pool.execute {
            try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.requestMethod = "GET"; c.connectTimeout = 15000; c.readTimeout = 20000
                val code = c.responseCode
                val resp = (if (code in 200..299) c.inputStream else c.errorStream)
                    ?.bufferedReader()?.readText() ?: ""
                onResult(code, resp); c.disconnect()
            } catch (e: Exception) { onResult(-1, e.message ?: "err") }
        }
    }
}
