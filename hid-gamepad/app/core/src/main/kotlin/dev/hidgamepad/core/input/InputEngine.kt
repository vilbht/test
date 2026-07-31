package dev.hidgamepad.core.input

import dev.hidgamepad.core.hid.GamepadDescriptor
import dev.hidgamepad.core.hid.GamepadState
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.StickSide
import dev.hidgamepad.core.layout.TriggerSide
import kotlin.math.atan2
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Control-level events produced by the touch router. */
sealed class ControlEvent {
    abstract val control: ControlSpec

    /**
     * @param dx,dy offset from zone center, normalized so the zone radius is 1.
     * @param squeeze contact size/pressure 0..1 when the platform reports it, else null.
     */
    data class Down(override val control: ControlSpec, val dx: Float, val dy: Float, val squeeze: Float? = null) : ControlEvent()
    data class Move(override val control: ControlSpec, val dx: Float, val dy: Float, val squeeze: Float? = null) : ControlEvent()
    data class Up(override val control: ControlSpec) : ControlEvent()
}

/** Feedback edges the app maps to haptics/sound. Never carries information alone. */
enum class FeedbackEdge { PRESS, RELEASE, TOGGLE_ON, TOGGLE_OFF, STICK_EDGE }

/**
 * Maps control events to [GamepadState] mutations, applying the
 * settings-driven modifier behavior (sticky buttons, dead zone, sensitivity,
 * long-press alternates, toggle latching, analog squeeze).
 *
 * Pure JVM: time comes in through [onTick]/event timestamps, output goes out
 * through [Listener]. Not thread-safe; the app confines it to one dispatcher.
 */
class InputEngine(private val listener: Listener) {

    interface Listener {
        fun onStateChanged(state: GamepadState)
        fun onFeedback(control: ControlSpec, edge: FeedbackEdge)
    }

    var settings: EngineSettings = EngineSettings()

    var state: GamepadState = GamepadState.NEUTRAL
        private set

    // Latched state for toggles and sticky buttons, keyed by control id.
    private val latched = mutableSetOf<String>()

    // Pending long-press candidates: control id -> press timestamp millis.
    private val pendingLongPress = mutableMapOf<String, Long>()

    // Buttons currently held because of a long-press alternate binding.
    private val longPressFired = mutableSetOf<String>()

    fun handle(event: ControlEvent, nowMs: Long) {
        when (event) {
            is ControlEvent.Down -> onDown(event, nowMs)
            is ControlEvent.Move -> onMove(event)
            is ControlEvent.Up -> onUp(event)
        }
    }

    /** Called periodically (report tick) so long-press promotion can fire. */
    fun onTick(nowMs: Long) {
        if (!settings.longPressEnabled || pendingLongPress.isEmpty()) return
        val due = pendingLongPress.filterValues { nowMs - it >= settings.longPressMs }
        due.keys.forEach { id ->
            pendingLongPress.remove(id)
            val control = heldControls[id] ?: return@forEach
            val zone = control as? ControlSpec.ButtonZone ?: return@forEach
            val alt = zone.longPressButtonNumber ?: return@forEach
            longPressFired.add(id)
            update(state.withButton(alt, true))
            listener.onFeedback(zone, FeedbackEdge.PRESS)
        }
    }

    // Controls currently touched, keyed by id (router guarantees one pointer per zone).
    private val heldControls = mutableMapOf<String, ControlSpec>()

    /** Force everything to neutral (connection loss, layout switch). */
    fun resetToNeutral() {
        latched.clear()
        pendingLongPress.clear()
        longPressFired.clear()
        heldControls.clear()
        update(GamepadState.NEUTRAL)
    }

    private fun onDown(event: ControlEvent.Down, nowMs: Long) {
        val control = event.control
        heldControls[control.id] = control
        when (control) {
            is ControlSpec.ButtonZone -> {
                if (settings.longPressEnabled && control.longPressButtonNumber != null) {
                    // Defer: decide between normal and alternate on timeout/release.
                    pendingLongPress[control.id] = nowMs
                    return
                }
                if (settings.stickyButtons) {
                    if (latched.remove(control.id)) {
                        update(state.withButton(control.buttonNumber, false))
                        listener.onFeedback(control, FeedbackEdge.TOGGLE_OFF)
                    } else {
                        latched.add(control.id)
                        update(state.withButton(control.buttonNumber, true))
                        listener.onFeedback(control, FeedbackEdge.TOGGLE_ON)
                    }
                } else {
                    update(state.withButton(control.buttonNumber, true))
                    listener.onFeedback(control, FeedbackEdge.PRESS)
                }
            }
            is ControlSpec.ToggleZone -> when (settings.toggleMode) {
                ToggleMode.FOLLOW -> {
                    update(state.withButton(control.buttonNumber, true))
                    listener.onFeedback(control, FeedbackEdge.TOGGLE_ON)
                }
                ToggleMode.FLIP -> {
                    val on = !latched.remove(control.id).also { if (!it) latched.add(control.id) }
                    update(state.withButton(control.buttonNumber, on))
                    listener.onFeedback(control, if (on) FeedbackEdge.TOGGLE_ON else FeedbackEdge.TOGGLE_OFF)
                }
            }
            is ControlSpec.StickZone -> {
                applyStick(control, event.dx, event.dy)
                listener.onFeedback(control, FeedbackEdge.PRESS)
            }
            is ControlSpec.TriggerZone -> {
                applyTrigger(control, event.squeeze)
                listener.onFeedback(control, FeedbackEdge.PRESS)
            }
            is ControlSpec.DpadZone -> {
                applyDpad(event.dx, event.dy)
                listener.onFeedback(control, FeedbackEdge.PRESS)
            }
        }
    }

    private fun onMove(event: ControlEvent.Move) {
        when (val control = event.control) {
            is ControlSpec.StickZone -> applyStick(control, event.dx, event.dy)
            is ControlSpec.DpadZone -> applyDpad(event.dx, event.dy)
            is ControlSpec.TriggerZone -> if (settings.analogSqueeze) applyTrigger(control, event.squeeze)
            else -> Unit
        }
    }

    private fun onUp(event: ControlEvent.Up) {
        val control = event.control
        heldControls.remove(control.id)
        when (control) {
            is ControlSpec.ButtonZone -> {
                val wasPending = pendingLongPress.remove(control.id) != null
                if (wasPending) {
                    // Released before the long-press threshold: emit a normal tap.
                    update(state.withButton(control.buttonNumber, true))
                    listener.onFeedback(control, FeedbackEdge.PRESS)
                    update(state.withButton(control.buttonNumber, false))
                    listener.onFeedback(control, FeedbackEdge.RELEASE)
                    return
                }
                if (longPressFired.remove(control.id)) {
                    val alt = control.longPressButtonNumber
                    if (alt != null) update(state.withButton(alt, false))
                    listener.onFeedback(control, FeedbackEdge.RELEASE)
                    return
                }
                if (!settings.stickyButtons) {
                    update(state.withButton(control.buttonNumber, false))
                    listener.onFeedback(control, FeedbackEdge.RELEASE)
                }
                // Sticky: release happens on the next tap, not on lift.
            }
            is ControlSpec.ToggleZone -> if (settings.toggleMode == ToggleMode.FOLLOW) {
                update(state.withButton(control.buttonNumber, false))
                listener.onFeedback(control, FeedbackEdge.TOGGLE_OFF)
            }
            is ControlSpec.StickZone -> {
                update(setStick(control.side, 0, 0))
                listener.onFeedback(control, FeedbackEdge.RELEASE)
            }
            is ControlSpec.TriggerZone -> {
                update(setTrigger(control.side, 0, control.mirrorDigital, pressed = false))
                listener.onFeedback(control, FeedbackEdge.RELEASE)
            }
            is ControlSpec.DpadZone -> {
                update(state.copy(hat = GamepadDescriptor.HAT_NEUTRAL))
                listener.onFeedback(control, FeedbackEdge.RELEASE)
            }
        }
    }

    private fun applyStick(control: ControlSpec.StickZone, dx: Float, dy: Float) {
        val mag = sqrt(dx * dx + dy * dy)
        val dz = settings.deadZone.coerceIn(0f, 0.9f)
        val scaled: Float = if (mag < dz) 0f else {
            val rescaled = ((mag - dz) / (1f - dz)) * settings.sensitivity
            rescaled.coerceAtMost(1f)
        }
        val atEdge = scaled >= 1f
        val (x, y) = if (mag == 0f || scaled == 0f) 0f to 0f else (dx / mag * scaled) to (dy / mag * scaled)
        val newState = setStick(
            control.side,
            (x * GamepadDescriptor.AXIS_MAX).roundToInt(),
            (y * GamepadDescriptor.AXIS_MAX).roundToInt(),
        )
        val changed = newState != state
        update(newState)
        if (atEdge && changed) listener.onFeedback(control, FeedbackEdge.STICK_EDGE)
    }

    private fun setStick(side: StickSide, x: Int, y: Int): GamepadState = when (side) {
        StickSide.LEFT -> state.copy(leftX = x, leftY = y)
        StickSide.RIGHT -> state.copy(rightX = x, rightY = y)
    }

    private fun applyTrigger(control: ControlSpec.TriggerZone, squeeze: Float?) {
        val travel = if (settings.analogSqueeze && squeeze != null) {
            (squeeze.coerceIn(0f, 1f) * GamepadDescriptor.TRIGGER_MAX).roundToInt()
        } else {
            GamepadDescriptor.TRIGGER_MAX
        }
        update(setTrigger(control.side, travel, control.mirrorDigital, pressed = true))
    }

    private fun setTrigger(side: TriggerSide, travel: Int, mirror: Boolean, pressed: Boolean): GamepadState {
        var s = when (side) {
            TriggerSide.LEFT -> state.copy(leftTrigger = travel)
            TriggerSide.RIGHT -> state.copy(rightTrigger = travel)
        }
        if (mirror) {
            val number = when (side) {
                TriggerSide.LEFT -> GamepadDescriptor.BUTTON_LT_DIGITAL
                TriggerSide.RIGHT -> GamepadDescriptor.BUTTON_RT_DIGITAL
            }
            s = s.withButton(number, pressed)
        }
        return s
    }

    private fun applyDpad(dx: Float, dy: Float) {
        val mag = sqrt(dx * dx + dy * dy)
        val hat = if (mag < settings.deadZone.coerceIn(0f, 0.9f)) {
            GamepadDescriptor.HAT_NEUTRAL
        } else {
            // Screen coords: +y is down. atan2 with -dy gives math angle; hat 0 is
            // north, increasing clockwise in 45-degree sectors.
            val deg = Math.toDegrees(atan2(dx.toDouble(), -dy.toDouble()))
            (((deg + 382.5) / 45.0).toInt()) % 8
        }
        update(state.copy(hat = hat))
    }

    private fun update(newState: GamepadState) {
        if (newState == state) return
        state = newState
        listener.onStateChanged(newState)
    }
}
