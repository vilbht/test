package dev.hidgamepad.core.input

import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.LayoutProfile
import dev.hidgamepad.core.layout.Vec2
import kotlinx.serialization.Serializable

@Serializable
enum class ToggleMode {
    /** Zone contact mirrors the physical latch: contact = ON, no contact = OFF. */
    FOLLOW,

    /** Each new contact flips the latch (for cases whose slider taps the glass). */
    FLIP,
}

@Serializable
enum class OneHandedMode { OFF, LEFT, RIGHT }

/**
 * Settings consumed by the input engine and layout transforms. The Android
 * app persists these (accessibility screen) and pushes updates in.
 */
@Serializable
data class EngineSettings(
    // Motor accessibility
    /** Momentary buttons latch on tap, release on second tap. */
    val stickyButtons: Boolean = false,
    /** Radial dead zone as a fraction of stick radius (0..0.9). */
    val deadZone: Float = 0.15f,
    /** Axis gain applied after the dead zone. */
    val sensitivity: Float = 1.0f,
    /** Holding a button past [longPressMs] presses its alternate binding instead. */
    val longPressEnabled: Boolean = false,
    val longPressMs: Long = 400,
    val oneHanded: OneHandedMode = OneHandedMode.OFF,
    /** Scale factor applied to zone radii (larger touch targets). */
    val targetScale: Float = 1.0f,
    // Case behavior
    val toggleMode: ToggleMode = ToggleMode.FOLLOW,
    /** Experimental: map contact size/pressure to analog trigger travel. */
    val analogSqueeze: Boolean = false,
)

/**
 * Applies settings-driven layout transforms (larger targets, one-handed
 * condensing) as a pure function, so UI and routing code never branch on
 * accessibility settings.
 */
fun LayoutProfile.applyAccessibility(settings: EngineSettings): LayoutProfile {
    if (settings.targetScale == 1.0f && settings.oneHanded == OneHandedMode.OFF) return this
    val transformed = controls.map { c ->
        var center = c.center
        var radius = c.radius * settings.targetScale
        when (settings.oneHanded) {
            OneHandedMode.OFF -> Unit
            // Condense the layout into the reachable half of the screen.
            OneHandedMode.LEFT -> {
                center = Vec2(center.x * 0.55f, center.y)
                radius *= 0.8f
            }
            OneHandedMode.RIGHT -> {
                center = Vec2(0.45f + center.x * 0.55f, center.y)
                radius *= 0.8f
            }
        }
        when (c) {
            is ControlSpec.ButtonZone -> c.copy(center = center, radius = radius)
            is ControlSpec.ToggleZone -> c.copy(center = center, radius = radius)
            is ControlSpec.StickZone -> c.copy(center = center, radius = radius)
            is ControlSpec.TriggerZone -> c.copy(center = center, radius = radius)
            is ControlSpec.DpadZone -> c.copy(center = center, radius = radius)
        }
    }
    return copy(controls = transformed)
}
