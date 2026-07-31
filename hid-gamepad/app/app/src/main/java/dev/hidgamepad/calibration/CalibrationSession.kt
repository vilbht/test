package dev.hidgamepad.calibration

import dev.hidgamepad.core.calibration.CalibrationMath
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.LayoutMode
import dev.hidgamepad.core.layout.LayoutProfile
import dev.hidgamepad.core.layout.ScreenInfo
import dev.hidgamepad.core.layout.Vec2

/**
 * Case-calibration state machine: walks the controls of a case template,
 * captures averaged contact positions per plunger (3 taps), rest center +
 * full-sweep travel for sticks, and produces a CASE-mode profile with the
 * measured geometry. Pure logic; the calibration screen drives it.
 */
class CalibrationSession(
    private val template: LayoutProfile,
    private val defaultRadius: Float,
    /** Re-prompt threshold: max spread between repeated taps (normalized). */
    private val maxSpread: Float = 0.03f,
) {
    sealed class Step {
        abstract val control: ControlSpec

        /** Tap the physical control [tapsNeeded] times. */
        data class Taps(override val control: ControlSpec, val tapsNeeded: Int, val tapsDone: Int) : Step()

        /** Press the stick at rest and lift. */
        data class StickRest(override val control: ControlSpec.StickZone) : Step()

        /** Deflect the stick in a full circle at max travel, then lift. */
        data class StickSweep(override val control: ControlSpec.StickZone, val rest: Vec2) : Step()
    }

    data class Result(val control: ControlSpec, val center: Vec2, val radius: Float)

    private val queue = ArrayDeque(template.controls)
    private val results = mutableListOf<Result>()
    private var tapSamples = mutableListOf<Vec2>()
    private var sweepSamples = mutableListOf<Vec2>()

    var step: Step? = nextStep()
        private set

    var lastError: String? = null
        private set

    val progress: Pair<Int, Int>
        get() = results.size to template.controls.size

    val done: Boolean get() = step == null

    private fun nextStep(): Step? {
        val control = queue.firstOrNull() ?: return null
        return when (control) {
            is ControlSpec.StickZone -> Step.StickRest(control)
            else -> Step.Taps(control, tapsNeeded = 3, tapsDone = 0)
        }
    }

    /** A completed press-release at [point] for tap-based steps. */
    fun onTap(point: Vec2) {
        val s = step
        if (s !is Step.Taps) return
        lastError = null
        tapSamples.add(point)
        if (tapSamples.size < s.tapsNeeded) {
            step = s.copy(tapsDone = tapSamples.size)
            return
        }
        if (CalibrationMath.maxSpread(tapSamples) > maxSpread) {
            lastError = "Taps were spread too far apart — try again, pressing the same control each time."
            tapSamples = mutableListOf()
            step = s.copy(tapsDone = 0)
            return
        }
        results.add(Result(s.control, CalibrationMath.centroid(tapSamples), defaultRadius))
        tapSamples = mutableListOf()
        queue.removeFirst()
        step = nextStep()
    }

    /** Stick rest press finished (lift) at [point]. */
    fun onStickRest(point: Vec2) {
        val s = step
        if (s !is Step.StickRest) return
        lastError = null
        step = Step.StickSweep(s.control, rest = point)
    }

    /** Streaming contact positions while the stick sweep is in progress. */
    fun onSweepSample(point: Vec2) {
        if (step is Step.StickSweep) sweepSamples.add(point)
    }

    /** Sweep finished (lift). */
    fun onSweepDone() {
        val s = step
        if (s !is Step.StickSweep) return
        if (sweepSamples.size < 8) {
            lastError = "Sweep was too short — deflect the stick in a full circle before lifting."
            sweepSamples = mutableListOf()
            return
        }
        lastError = null
        val radius = CalibrationMath.fitTravelRadius(s.rest, sweepSamples)
        results.add(Result(s.control, s.rest, radius.coerceAtLeast(defaultRadius / 2)))
        sweepSamples = mutableListOf()
        queue.removeFirst()
        step = nextStep()
    }

    /** Builds the calibrated CASE profile once [done]. */
    fun buildProfile(name: String, screen: ScreenInfo): LayoutProfile {
        check(done) { "Calibration not finished" }
        val controls = results.map { r ->
            when (val c = r.control) {
                is ControlSpec.ButtonZone -> c.copy(center = r.center, radius = r.radius)
                is ControlSpec.ToggleZone -> c.copy(center = r.center, radius = r.radius)
                is ControlSpec.StickZone -> c.copy(center = r.center, radius = r.radius)
                is ControlSpec.TriggerZone -> c.copy(center = r.center, radius = r.radius)
                is ControlSpec.DpadZone -> c.copy(center = r.center, radius = r.radius)
            }
        }
        return LayoutProfile(name = name, mode = LayoutMode.CASE, controls = controls, screen = screen)
    }
}
