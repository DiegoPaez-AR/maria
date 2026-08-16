package io.intensa.mariabridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent?) {
        MbLog.init(c); MbLog.i("boot", "teléfono booteó — arrancando servicio")
        if (Prefs.activo(c)) {
            val svc = Intent(c, OutboxService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= 26) c.startForegroundService(svc) else c.startService(svc)
        }
    }
}
