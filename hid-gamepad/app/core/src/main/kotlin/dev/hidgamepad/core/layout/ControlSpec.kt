package dev.hidgamepad.core.layout

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A point or size in screen-normalized coordinates (0..1 of width/height). */
@Serializable
data class Vec2(val x: Float, val y: Float)

@Serializable
enum class StickSide { LEFT, RIGHT }

@Serializable
enum class TriggerSide { LEFT, RIGHT }

/**
 * A touch zone on screen bound to a gamepad control. Geometry is normalized
 * (0..1 of screen width/height) so profiles survive resolution changes; the
 * capture-time screen metadata lives on [LayoutProfile].
 *
 * All zones are circles: `center` + `radius` (radius normalized to screen
 * width). Case mode uses nearest-center hit-testing, free mode containment.
 */
@Serializable
sealed class ControlSpec {
    abstract val id: String
    abstract val label: String
    abstract val center: Vec2
    abstract val radius: Float

    /** Momentary push button bound to a HID button number (1..16). */
    @Serializable
    @SerialName("button")
    data class ButtonZone(
        override val id: String,
        override val label: String,
        override val center: Vec2,
        override val radius: Float,
        val buttonNumber: Int,
        /** Optional alternate button emitted by the long-press accessibility modifier. */
        val longPressButtonNumber: Int? = null,
    ) : ControlSpec()

    /** Latching toggle bound to a HID button number (defaults 13..16). */
    @Serializable
    @SerialName("toggle")
    data class ToggleZone(
        override val id: String,
        override val label: String,
        override val center: Vec2,
        override val radius: Float,
        val buttonNumber: Int,
    ) : ControlSpec()

    /** Analog stick; deflection from center maps to an axis pair. */
    @Serializable
    @SerialName("stick")
    data class StickZone(
        override val id: String,
        override val label: String,
        override val center: Vec2,
        override val radius: Float,
        val side: StickSide,
    ) : ControlSpec()

    /** Analog trigger; digital press = full pull unless analog squeeze is enabled. */
    @Serializable
    @SerialName("trigger")
    data class TriggerZone(
        override val id: String,
        override val label: String,
        override val center: Vec2,
        override val radius: Float,
        val side: TriggerSide,
        /** Also press the digital mirror button (7/8) while active. */
        val mirrorDigital: Boolean = true,
    ) : ControlSpec()

    /** D-pad; touch angle from center selects one of 8 hat directions. */
    @Serializable
    @SerialName("dpad")
    data class DpadZone(
        override val id: String,
        override val label: String,
        override val center: Vec2,
        override val radius: Float,
    ) : ControlSpec()
}
