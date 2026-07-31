package dev.hidgamepad.ui.connection

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.hidgamepad.bluetooth.ConnectionState
import dev.hidgamepad.bluetooth.HidDeviceService
import dev.hidgamepad.ui.LocalAppContainer
import dev.hidgamepad.ui.common.ScreenHeader
import kotlinx.coroutines.launch

@SuppressLint("MissingPermission") // gated by PermissionGate
@Composable
fun ConnectionScreen(
    onBack: () -> Unit,
    onOpenProfiles: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenCalibration: () -> Unit,
) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val connection by container.transport.state.collectAsState()
    val settings by container.settings.collectAsState()
    val scope = rememberCoroutineScope()

    PermissionGate {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            ScreenHeader("Connection", onBack = onBack)

            Text(
                text = when (val c = connection) {
                    is ConnectionState.Connected -> "Connected to ${deviceLabel(c.device)}"
                    is ConnectionState.Connecting -> "Connecting to ${deviceLabel(c.device)}…"
                    ConnectionState.Registered -> "Registered — pair from your PC/TV or pick a bonded device below"
                    ConnectionState.Registering -> "Registering with the Bluetooth stack…"
                    is ConnectionState.Unsupported -> c.reason
                    ConnectionState.Idle -> "Gamepad service not running"
                },
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .padding(vertical = 12.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                when (connection) {
                    ConnectionState.Idle, is ConnectionState.Unsupported ->
                        Button(onClick = { HidDeviceService.start(context) }) { Text("Start gamepad") }
                    is ConnectionState.Connected ->
                        Button(onClick = { container.transport.disconnect() }) { Text("Disconnect") }
                    else ->
                        OutlinedButton(onClick = { HidDeviceService.stop(context) }) { Text("Stop gamepad") }
                }
                OutlinedButton(onClick = {
                    context.startActivity(
                        Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE).apply {
                            putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300)
                        },
                    )
                }) { Text("Make discoverable") }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(vertical = 12.dp),
            ) {
                OutlinedButton(onClick = onOpenProfiles) { Text("Profiles") }
                OutlinedButton(onClick = onOpenCalibration) { Text("Calibrate case") }
                OutlinedButton(onClick = onOpenSettings) { Text("Settings") }
            }

            HorizontalDivider()
            Text(
                "Paired devices",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 8.dp),
            )

            val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            val bonded = try {
                adapter?.bondedDevices?.toList().orEmpty()
            } catch (e: SecurityException) {
                emptyList()
            }
            if (bonded.isEmpty()) {
                Text(
                    "No paired devices yet. Start the gamepad, make the phone " +
                        "discoverable, then pair from your PC or TV's Bluetooth settings.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(bonded, key = { it.address }) { device ->
                    Card(onClick = {
                        container.transport.connect(device)
                        scope.launch {
                            container.settingsRepository.update { it.copy(lastHostAddress = device.address) }
                        }
                    }) {
                        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                            Text(deviceLabel(device), style = MaterialTheme.typography.bodyLarge)
                            Text(device.address, style = MaterialTheme.typography.bodySmall)
                            if (device.address == settings.lastHostAddress) {
                                Text("Last host", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

@SuppressLint("MissingPermission")
private fun deviceLabel(device: android.bluetooth.BluetoothDevice): String =
    try {
        device.name ?: device.address
    } catch (e: SecurityException) {
        device.address
    }
