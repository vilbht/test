package dev.hidgamepad.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.hidgamepad.core.input.OneHandedMode
import dev.hidgamepad.core.input.ToggleMode
import dev.hidgamepad.data.AppSettings
import dev.hidgamepad.ui.LocalAppContainer
import dev.hidgamepad.ui.common.ScreenHeader
import kotlinx.coroutines.launch

/**
 * Accessibility and feedback settings. Every feature is an independent
 * toggle; changes apply immediately (no restart) because the engine, theme,
 * and layout all observe the settings flow.
 */
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val settings by container.settings.collectAsState()
    val scope = rememberCoroutineScope()

    fun update(transform: (AppSettings) -> AppSettings) {
        scope.launch { container.settingsRepository.update(transform) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        ScreenHeader("Settings", onBack = onBack)

        Section("Motor accessibility")
        ToggleRow("Sticky buttons", "Tap latches a button; tap again releases it", settings.engine.stickyButtons) { v ->
            update { it.copy(engine = it.engine.copy(stickyButtons = v)) }
        }
        SliderRow("Stick dead zone", settings.engine.deadZone, 0f..0.5f) { v ->
            update { it.copy(engine = it.engine.copy(deadZone = v)) }
        }
        SliderRow("Stick sensitivity", settings.engine.sensitivity, 0.5f..2.5f) { v ->
            update { it.copy(engine = it.engine.copy(sensitivity = v)) }
        }
        ToggleRow("Long-press alternates", "Holding a button past a threshold presses its alternate binding", settings.engine.longPressEnabled) { v ->
            update { it.copy(engine = it.engine.copy(longPressEnabled = v)) }
        }
        SliderRow("Touch target scale", settings.engine.targetScale, 1f..2f) { v ->
            update { it.copy(engine = it.engine.copy(targetScale = v)) }
        }
        Text("One-handed layout", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 8.dp))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            OneHandedMode.entries.forEachIndexed { i, mode ->
                SegmentedButton(
                    selected = settings.engine.oneHanded == mode,
                    onClick = { update { it.copy(engine = it.engine.copy(oneHanded = mode)) } },
                    shape = SegmentedButtonDefaults.itemShape(index = i, count = OneHandedMode.entries.size),
                ) { Text(mode.name.lowercase().replaceFirstChar(Char::uppercase)) }
            }
        }

        Section("Vision accessibility")
        ToggleRow("High contrast", "Maximum-contrast colors, thick outlines", settings.highContrast) { v ->
            update { it.copy(highContrast = v) }
        }
        ToggleRow("Large labels", "Bigger control labels", settings.largeLabels) { v ->
            update { it.copy(largeLabels = v) }
        }
        ToggleRow("Haptic button identity", "Face buttons pulse N times for button N — play by feel", settings.hapticIdentity) { v ->
            update { it.copy(hapticIdentity = v) }
        }

        Section("Feedback")
        ToggleRow("Haptics", "Vibration feedback for every control", settings.hapticsEnabled) { v ->
            update { it.copy(hapticsEnabled = v) }
        }
        ToggleRow("Sounds", "Click sounds (always redundant to haptics and visuals)", settings.soundEnabled) { v ->
            update { it.copy(soundEnabled = v) }
        }

        Section("Case behavior")
        Text("Toggle slider mode", style = MaterialTheme.typography.bodyLarge)
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            ToggleMode.entries.forEachIndexed { i, mode ->
                SegmentedButton(
                    selected = settings.engine.toggleMode == mode,
                    onClick = { update { it.copy(engine = it.engine.copy(toggleMode = mode)) } },
                    shape = SegmentedButtonDefaults.itemShape(index = i, count = ToggleMode.entries.size),
                ) { Text(if (mode == ToggleMode.FOLLOW) "Follow contact" else "Flip per tap") }
            }
        }
        ToggleRow(
            "Analog squeeze (experimental)",
            "Map touch contact size to trigger travel. Unreliable on many phones — " +
                "disable if triggers misbehave.",
            settings.engine.analogSqueeze,
        ) { v -> update { it.copy(engine = it.engine.copy(analogSqueeze = v)) } }
    }
}

@Composable
private fun Section(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 20.dp, bottom = 4.dp),
    )
}

@Composable
private fun ToggleRow(title: String, description: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(description, style = MaterialTheme.typography.bodySmall)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            modifier = Modifier.semantics { contentDescription = title },
        )
    }
}

@Composable
private fun SliderRow(title: String, value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit) {
    Column(modifier = Modifier.padding(vertical = 6.dp)) {
        Text("$title: ${"%.2f".format(value)}", style = MaterialTheme.typography.bodyLarge)
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            modifier = Modifier.semantics { contentDescription = title },
        )
    }
}
