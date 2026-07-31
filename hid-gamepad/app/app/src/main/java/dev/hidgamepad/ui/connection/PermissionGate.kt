package dev.hidgamepad.ui.connection

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

/**
 * Gates Bluetooth-touching UI on the runtime permissions the platform
 * requires (BLUETOOTH_CONNECT/ADVERTISE on API 31+; notifications on 33+ so
 * the foreground-service notification is visible). Denial gets a real
 * explanation and a retry — never silent failure.
 */
@Composable
fun PermissionGate(content: @Composable () -> Unit) {
    val context = LocalContext.current

    val required = buildList {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_CONNECT)
            add(Manifest.permission.BLUETOOTH_ADVERTISE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    fun granted(): Boolean = required.all {
        // The notification permission is nice-to-have, not blocking.
        it == Manifest.permission.POST_NOTIFICATIONS ||
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    val grantedState = remember { mutableStateOf(granted()) }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grantedState.value = granted() }

    if (grantedState.value) {
        content()
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Bluetooth permission needed",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            "To act as a Bluetooth gamepad, this app needs permission to " +
                "connect to Bluetooth devices and to be discoverable by the " +
                "PC or TV you want to pair with. No location data is used.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(onClick = { launcher.launch(required.toTypedArray()) }) {
            Text("Grant permissions")
        }
    }
}
