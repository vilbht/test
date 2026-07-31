package dev.hidgamepad.feedback

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import dev.hidgamepad.core.input.FeedbackEdge
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * Optional click sounds, synthesized in memory (no assets). Structural
 * hearing-accessibility rule: this controller is only ever invoked alongside
 * the haptic/visual dispatch in AppContainer, so sound never carries
 * information alone.
 */
class SoundController {

    @Volatile
    var enabled: Boolean = false

    private val sampleRate = 22050

    private val press = clickPcm(1600.0, 0.030)
    private val release = clickPcm(1100.0, 0.022)
    private val toggleOn = clickPcm(1900.0, 0.045)
    private val toggleOff = clickPcm(800.0, 0.045)

    fun play(edge: FeedbackEdge) {
        if (!enabled) return
        val pcm = when (edge) {
            FeedbackEdge.PRESS -> press
            FeedbackEdge.RELEASE -> release
            FeedbackEdge.TOGGLE_ON -> toggleOn
            FeedbackEdge.TOGGLE_OFF -> toggleOff
            FeedbackEdge.STICK_EDGE -> release
        }
        // Fire-and-forget static track; tiny buffers, released on completion.
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(pcm.size * 2)
            .build()
        track.write(pcm, 0, pcm.size)
        track.setNotificationMarkerPosition(pcm.size)
        track.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
            override fun onMarkerReached(t: AudioTrack) = t.release()
            override fun onPeriodicNotification(t: AudioTrack) = Unit
        })
        track.play()
    }

    /** Short exponentially-decaying sine "click". */
    private fun clickPcm(freqHz: Double, seconds: Double): ShortArray {
        val n = (sampleRate * seconds).toInt()
        return ShortArray(n) { i ->
            val t = i.toDouble() / sampleRate
            val env = exp(-t * 60.0)
            (sin(2 * PI * freqHz * t) * env * Short.MAX_VALUE * 0.5).toInt().toShort()
        }
    }
}
