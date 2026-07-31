package dev.hidgamepad.ui.profiles

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
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.hidgamepad.core.layout.DefaultLayouts
import dev.hidgamepad.core.profile.CaseExport
import dev.hidgamepad.ui.LocalAppContainer
import dev.hidgamepad.ui.common.ScreenHeader
import kotlinx.coroutines.launch

@Composable
fun ProfilesScreen(onBack: () -> Unit, onEdit: (String) -> Unit) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val profiles by container.profileRepository.profiles.collectAsState()
    val settings by container.settings.collectAsState()
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        ScreenHeader("Profiles", onBack = onBack)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            OutlinedButton(onClick = {
                scope.launch {
                    val base = DefaultLayouts.freeDefault()
                    var name = "My layout"
                    var i = 2
                    while (profiles.any { it.name == name }) name = "My layout ${i++}"
                    container.profileRepository.save(base.copy(name = name))
                }
            }) { Text("New from default") }
            OutlinedButton(onClick = {
                scope.launch {
                    val text = clipboard.getText()?.text.orEmpty()
                    message = container.profileRepository.import(text) ?: "Imported."
                }
            }) { Text("Import from clipboard") }
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Card(onClick = {
                    scope.launch { container.settingsRepository.update { it.copy(activeProfile = null) } }
                }) {
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text("Built-in default", style = MaterialTheme.typography.bodyLarge)
                        if (settings.activeProfile == null) {
                            Text("Active", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
            items(profiles, key = { it.name }) { profile ->
                Card(onClick = {
                    scope.launch { container.settingsRepository.update { it.copy(activeProfile = profile.name) } }
                }) {
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(profile.name, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${profile.mode.name.lowercase()} · ${profile.controls.size} controls",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (settings.activeProfile == profile.name) {
                            Text("Active", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { onEdit(profile.name) }) { Text("Edit") }
                            TextButton(onClick = {
                                val json = container.profileRepository.export(profile)
                                context.startActivity(
                                    Intent.createChooser(
                                        Intent(Intent.ACTION_SEND)
                                            .setType("application/json")
                                            .putExtra(Intent.EXTRA_TEXT, json),
                                        "Share profile",
                                    ),
                                )
                            }) { Text("Share") }
                            if (profile.screen != null) {
                                TextButton(onClick = {
                                    val scad = CaseExport.toScadFragment(profile)
                                    context.startActivity(
                                        Intent.createChooser(
                                            Intent(Intent.ACTION_SEND)
                                                .setType("text/plain")
                                                .putExtra(Intent.EXTRA_TEXT, scad),
                                            "Share case config (OpenSCAD)",
                                        ),
                                    )
                                }) { Text("Case config") }
                            }
                            TextButton(onClick = {
                                scope.launch { container.profileRepository.delete(profile.name) }
                            }) { Text("Delete") }
                        }
                    }
                }
            }
        }
    }
}
