package dev.hidgamepad.ui.calibration

import android.view.MotionEvent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInteropFilter
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import dev.hidgamepad.calibration.CalibrationSession
import dev.hidgamepad.core.layout.DefaultLayouts
import dev.hidgamepad.core.layout.ScreenInfo
import dev.hidgamepad.core.layout.Vec2
import dev.hidgamepad.ui.LocalAppContainer
import kotlinx.coroutines.launch

/**
 * Guided case calibration. The whole screen is a raw-touch visualizer (live
 * contacts drawn as rings) which doubles as the palm-rejection diagnostic:
 * if a physical contact vanishes while still held, the phone's touch
 * firmware dropped it — visible immediately.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun CalibrationScreen(onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // ~9 mm default zone radius, normalized to screen width.
    val metrics = context.resources.displayMetrics
    val defaultRadiusNorm = (9f / 25.4f * metrics.xdpi) / metrics.widthPixels

    val session = remember { CalibrationSession(DefaultLayouts.caseTemplate(), defaultRadiusNorm) }
    var stepVersion by remember { mutableIntStateOf(0) } // recompose driver
    var canvasSize by remember { mutableStateOf(IntSize(1, 1)) }
    val liveTouches = remember { mutableStateOf<Map<Int, Vec2>>(emptyMap()) }
    var profileName by remember { mutableStateOf("My case") }
    var saved by remember { mutableStateOf(false) }
    var contactWarning by remember { mutableStateOf<String?>(null) }

    // Track press position per pointer so a tap = down+up at the down point.
    val downPositions = remember { mutableMapOf<Int, Vec2>() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .onSizeChanged { canvasSize = it }
            .pointerInteropFilter { event ->
                val w = canvasSize.width.toFloat().coerceAtLeast(1f)
                val h = canvasSize.height.toFloat().coerceAtLeast(1f)
                fun pos(i: Int) = Vec2(event.getX(i) / w, event.getY(i) / h)
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                        val i = event.actionIndex
                        val id = event.getPointerId(i)
                        downPositions[id] = pos(i)
                        liveTouches.value = liveTouches.value + (id to pos(i))
                        if (liveTouches.value.size > 8) {
                            contactWarning = "Many simultaneous contacts — approaching the panel's multi-touch limit."
                        }
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val updated = liveTouches.value.toMutableMap()
                        for (i in 0 until event.pointerCount) {
                            val id = event.getPointerId(i)
                            updated[id] = pos(i)
                            session.onSweepSample(pos(i))
                        }
                        liveTouches.value = updated
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                        val i = event.actionIndex
                        val id = event.getPointerId(i)
                        val down = downPositions.remove(id)
                        liveTouches.value = liveTouches.value - id
                        val p = pos(i)
                        when (session.step) {
                            is CalibrationSession.Step.Taps -> session.onTap(down ?: p)
                            is CalibrationSession.Step.StickRest -> session.onStickRest(down ?: p)
                            is CalibrationSession.Step.StickSweep -> session.onSweepDone()
                            null -> Unit
                        }
                        stepVersion++
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        downPositions.clear()
                        liveTouches.value = emptyMap()
                    }
                }
                true
            },
    ) {
        // Live contacts + captured zones
        Canvas(modifier = Modifier.fillMaxSize()) {
            liveTouches.value.values.forEach { t ->
                drawCircle(
                    color = androidx.compose.ui.graphics.Color.Cyan,
                    radius = 40f,
                    center = Offset(t.x * size.width, t.y * size.height),
                    style = Stroke(width = 4f),
                )
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Text("Case calibration", style = MaterialTheme.typography.titleLarge)
            }

            @Suppress("UNUSED_EXPRESSION") stepVersion
            val step = session.step
            val (done, total) = session.progress
            val prompt = when (step) {
                is CalibrationSession.Step.Taps ->
                    "Press \"${step.control.label}\" (${step.tapsDone + 1} of ${step.tapsNeeded})"
                is CalibrationSession.Step.StickRest ->
                    "Press \"${step.control.label}\" at rest, then release"
                is CalibrationSession.Step.StickSweep ->
                    "Deflect \"${step.control.label}\" in a full circle at maximum travel, then release"
                null -> "All ${total} controls captured — name and save your profile"
            }
            Text(
                "$prompt   ($done/$total)",
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            session.lastError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }
            contactWarning?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            if (session.done && !saved) {
                OutlinedTextField(
                    value = profileName,
                    onValueChange = { profileName = it },
                    label = { Text("Profile name") },
                )
                Button(onClick = {
                    val screen = ScreenInfo(
                        widthPx = metrics.widthPixels,
                        heightPx = metrics.heightPixels,
                        xdpi = metrics.xdpi,
                        ydpi = metrics.ydpi,
                    )
                    val profile = session.buildProfile(profileName, screen)
                    scope.launch {
                        container.profileRepository.save(profile)
                        container.settingsRepository.update { it.copy(activeProfile = profile.name) }
                        saved = true
                        onBack()
                    }
                }) { Text("Save and activate") }
            }
        }
    }
}
