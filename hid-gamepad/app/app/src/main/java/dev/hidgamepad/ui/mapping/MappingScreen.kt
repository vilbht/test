package dev.hidgamepad.ui.mapping

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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.Vec2
import dev.hidgamepad.ui.LocalAppContainer
import dev.hidgamepad.ui.common.ScreenHeader
import kotlinx.coroutines.launch

/**
 * Remapping and zone editing for a saved profile: any button/toggle zone can
 * be bound to any HID button, and every zone can be nudged/resized. Full
 * remapping is the foundation the motor-accessibility features build on.
 */
@Composable
fun MappingScreen(profileName: String, onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    val original = remember(profileName) { container.profileRepository.byName(profileName) }

    if (original == null) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Text("Profile \"$profileName\" not found.")
            OutlinedButton(onClick = onBack) { Text("Back") }
        }
        return
    }

    var profile by remember { mutableStateOf(original) }
    var dirty by remember { mutableStateOf(false) }

    fun replaceControl(old: ControlSpec, new: ControlSpec) {
        profile = profile.copy(controls = profile.controls.map { if (it.id == old.id) new else it })
        dirty = true
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        ScreenHeader("Edit: $profileName", onBack = onBack) {
            if (dirty) {
                Button(onClick = {
                    scope.launch {
                        container.profileRepository.save(profile)
                        dirty = false
                    }
                }) { Text("Save") }
            }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(profile.controls, key = { it.id }) { control ->
                Card {
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(
                            "${control.label} — ${describe(control)}",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        // Button binding stepper for bindable zones
                        val number = when (control) {
                            is ControlSpec.ButtonZone -> control.buttonNumber
                            is ControlSpec.ToggleZone -> control.buttonNumber
                            else -> null
                        }
                        if (number != null) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text("HID button $number")
                                OutlinedButton(
                                    onClick = {
                                        val n = (number - 2 + 16) % 16 + 1
                                        replaceControl(control, withButtonNumber(control, n))
                                    },
                                    modifier = Modifier.semantics { contentDescription = "Previous button for ${control.label}" },
                                ) { Text("−") }
                                OutlinedButton(
                                    onClick = {
                                        val n = number % 16 + 1
                                        replaceControl(control, withButtonNumber(control, n))
                                    },
                                    modifier = Modifier.semantics { contentDescription = "Next button for ${control.label}" },
                                ) { Text("+") }
                            }
                        }
                        // Geometry nudge: position arrows + radius
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            val step = 0.01f
                            OutlinedButton(onClick = { replaceControl(control, moved(control, -step, 0f)) }) { Text("◀") }
                            OutlinedButton(onClick = { replaceControl(control, moved(control, step, 0f)) }) { Text("▶") }
                            OutlinedButton(onClick = { replaceControl(control, moved(control, 0f, -step)) }) { Text("▲") }
                            OutlinedButton(onClick = { replaceControl(control, moved(control, 0f, step)) }) { Text("▼") }
                            OutlinedButton(onClick = { replaceControl(control, resized(control, 0.9f)) }) { Text("smaller") }
                            OutlinedButton(onClick = { replaceControl(control, resized(control, 1.1f)) }) { Text("larger") }
                        }
                    }
                }
            }
        }
    }
}

private fun describe(c: ControlSpec): String = when (c) {
    is ControlSpec.ButtonZone -> "button"
    is ControlSpec.ToggleZone -> "toggle"
    is ControlSpec.StickZone -> "${c.side.name.lowercase()} stick"
    is ControlSpec.TriggerZone -> "${c.side.name.lowercase()} trigger"
    is ControlSpec.DpadZone -> "D-pad"
}

private fun withButtonNumber(c: ControlSpec, n: Int): ControlSpec = when (c) {
    is ControlSpec.ButtonZone -> c.copy(buttonNumber = n)
    is ControlSpec.ToggleZone -> c.copy(buttonNumber = n)
    else -> c
}

private fun moved(c: ControlSpec, dx: Float, dy: Float): ControlSpec {
    val center = Vec2(
        (c.center.x + dx).coerceIn(0f, 1f),
        (c.center.y + dy).coerceIn(0f, 1f),
    )
    return when (c) {
        is ControlSpec.ButtonZone -> c.copy(center = center)
        is ControlSpec.ToggleZone -> c.copy(center = center)
        is ControlSpec.StickZone -> c.copy(center = center)
        is ControlSpec.TriggerZone -> c.copy(center = center)
        is ControlSpec.DpadZone -> c.copy(center = center)
    }
}

private fun resized(c: ControlSpec, factor: Float): ControlSpec {
    val radius = (c.radius * factor).coerceIn(0.01f, 0.4f)
    return when (c) {
        is ControlSpec.ButtonZone -> c.copy(radius = radius)
        is ControlSpec.ToggleZone -> c.copy(radius = radius)
        is ControlSpec.StickZone -> c.copy(radius = radius)
        is ControlSpec.TriggerZone -> c.copy(radius = radius)
        is ControlSpec.DpadZone -> c.copy(radius = radius)
    }
}
