package dev.hidgamepad.feedback

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import dev.hidgamepad.core.input.FeedbackEdge
import dev.hidgamepad.core.layout.ControlSpec

/**
 * Distinct haptic patterns per control type and edge, so the pad is usable
 * eyes-free (vision accessibility). Uses composition primitives where the
 * device supports them all, otherwise distinct one-shot/waveform fallbacks.
 *
 * With [identityPatterns] on, face buttons additionally pulse N times for
 * button N so each button is identifiable by feel alone.
 */
class HapticsController(context: Context) {

    @Volatile
    var enabled: Boolean = true

    @Volatile
    var identityPatterns: Boolean = false

    private val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    private val primitivesSupported: Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            vibrator?.areAllPrimitivesSupported(
                VibrationEffect.Composition.PRIMITIVE_CLICK,
                VibrationEffect.Composition.PRIMITIVE_TICK,
            ) == true

    fun play(control: ControlSpec, edge: FeedbackEdge) {
        if (!enabled) return
        val v = vibrator ?: return
        if (!v.hasVibrator()) return

        if (identityPatterns && control is ControlSpec.ButtonZone &&
            edge == FeedbackEdge.PRESS && control.buttonNumber in 1..4
        ) {
            v.vibrate(identityEffect(control.buttonNumber))
            return
        }
        v.vibrate(effectFor(control, edge))
    }

    /** N short pulses for face button N. */
    private fun identityEffect(n: Int): VibrationEffect {
        val timings = LongArray(n * 2) { i -> if (i % 2 == 0) 30L else 20L }
        val amplitudes = IntArray(n * 2) { i -> if (i % 2 == 0) 0 else 255 }
        return VibrationEffect.createWaveform(timings, amplitudes, -1)
    }

    private fun effectFor(control: ControlSpec, edge: FeedbackEdge): VibrationEffect {
        if (primitivesSupported && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val composition = VibrationEffect.startComposition()
            when (edge) {
                FeedbackEdge.PRESS -> composition.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1f)
                FeedbackEdge.RELEASE -> composition.addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.6f)
                FeedbackEdge.TOGGLE_ON -> composition
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1f)
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.8f, 60)
                FeedbackEdge.TOGGLE_OFF -> composition
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.8f)
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.4f, 60)
                FeedbackEdge.STICK_EDGE -> composition.addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 1f)
            }
            return composition.compose()
        }
        // Fallback: distinct one-shots/waveforms per edge.
        return when (edge) {
            FeedbackEdge.PRESS -> VibrationEffect.createOneShot(20, 255)
            FeedbackEdge.RELEASE -> VibrationEffect.createOneShot(10, 120)
            FeedbackEdge.TOGGLE_ON -> VibrationEffect.createWaveform(longArrayOf(0, 25, 40, 25), intArrayOf(0, 255, 0, 180), -1)
            FeedbackEdge.TOGGLE_OFF -> VibrationEffect.createWaveform(longArrayOf(0, 15, 40, 15), intArrayOf(0, 120, 0, 60), -1)
            FeedbackEdge.STICK_EDGE -> VibrationEffect.createOneShot(12, 180)
        }
    }
}
