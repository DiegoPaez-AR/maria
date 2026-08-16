package is.paez.mariabridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent?) {
        if (Prefs.activo(c)) {
            val svc = Intent(c, OutboxService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= 26) c.startForegroundService(svc) else c.startService(svc)
        }
    }
}
