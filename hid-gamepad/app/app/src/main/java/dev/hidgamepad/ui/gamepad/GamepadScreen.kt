package dev.hidgamepad.ui.gamepad

import android.view.MotionEvent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInteropFilter
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.hidgamepad.bluetooth.ConnectionState
import dev.hidgamepad.core.hid.GamepadState
import dev.hidgamepad.core.input.ControlEvent
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.ui.LocalAppContainer
import dev.hidgamepad.ui.theme.LocalLabelScale

/**
 * The gamepad itself. One full-screen pointer handler feeds the touch
 * router (per-control clickable modifiers would add slop latency and lose
 * pointers sliding between zones); everything drawn here is a *consumer* of
 * the logical state — rendering never gates report sending.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun GamepadScreen(onOpenMenu: () -> Unit) {
    val container = LocalAppContainer.current
    val layout by container.activeLayout.collectAsState()
    val state by container.gamepadState.collectAsState()
    val connection by container.transport.state.collectAsState()

    var canvasSize by remember { mutableStateOf(IntSize(1, 1)) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .onSizeChanged { canvasSize = it }
            .pointerInteropFilter { event ->
                val w = canvasSize.width.toFloat().coerceAtLeast(1f)
                val h = canvasSize.height.toFloat().coerceAtLeast(1f)
                val now = event.eventTime
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                        val i = event.actionIndex
                        container.router.pointerDown(
                            event.getPointerId(i),
                            event.getX(i) / w,
                            event.getY(i) / h,
                            event.getSize(i).coerceIn(0f, 1f),
                            now,
                        )
                    }
                    MotionEvent.ACTION_MOVE -> {
                        for (i in 0 until event.pointerCount) {
                            container.router.pointerMove(
                                event.getPointerId(i),
                                event.getX(i) / w,
                                event.getY(i) / h,
                                event.getSize(i).coerceIn(0f, 1f),
                                now,
                            )
                        }
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                        container.router.pointerUp(event.getPointerId(event.actionIndex), now)
                    }
                    MotionEvent.ACTION_CANCEL -> container.router.cancelAll(now)
                }
                true
            },
    ) {
        // Faint brand watermark behind the controls (decorative only).
        Image(
            painter = painterResource(dev.hidgamepad.R.drawable.firefox_logo),
            contentDescription = null,
            alpha = 0.06f,
            modifier = Modifier
                .align(Alignment.Center)
                .size(180.dp),
        )

        ControlsCanvas(layout.controls, state)

        // Invisible semantic nodes so every control is reachable and
        // actionable with TalkBack (screen-reader support is unconditional).
        ControlSemantics(layout.controls, state, canvasSize)

        // The brand mark doubles as the menu button.
        IconButton(
            onClick = onOpenMenu,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(4.dp),
        ) {
            Image(
                painter = painterResource(dev.hidgamepad.R.drawable.firefox_logo),
                contentDescription = "Open connection and settings menu",
                alpha = 0.85f,
                modifier = Modifier.size(28.dp),
            )
        }

        Text(
            text = when (val c = connection) {
                is ConnectionState.Connected -> "Connected"
                is ConnectionState.Connecting -> "Connecting…"
                is ConnectionState.Registered -> "Ready to pair"
                is ConnectionState.Registering -> "Starting…"
                is ConnectionState.Unsupported -> "Unavailable: ${c.reason}"
                ConnectionState.Idle -> "Not started"
            },
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            fontSize = 12.sp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 8.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

@Composable
private fun ControlsCanvas(controls: List<ControlSpec>, state: GamepadState) {
    val measurer = rememberTextMeasurer()
    val labelScale = LocalLabelScale.current
    val primary = MaterialTheme.colorScheme.primary
    val outline = MaterialTheme.colorScheme.onBackground
    val labelColor = MaterialTheme.colorScheme.onBackground

    Canvas(modifier = Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        controls.forEach { c ->
            val center = Offset(c.center.x * w, c.center.y * h)
            val radius = c.radius * w
            when (c) {
                is ControlSpec.ButtonZone -> {
                    val pressed = state.isButtonPressed(c.buttonNumber)
                    drawCircle(
                        color = if (pressed) primary else outline.copy(alpha = 0.35f),
                        radius = radius,
                        center = center,
                        style = if (pressed) androidx.compose.ui.graphics.drawscope.Fill else Stroke(width = 3f),
                    )
                }
                is ControlSpec.ToggleZone -> {
                    val on = state.isButtonPressed(c.buttonNumber)
                    drawCircle(
                        color = outline.copy(alpha = 0.35f),
                        radius = radius,
                        center = center,
                        style = Stroke(width = 3f),
                    )
                    if (on) drawCircle(color = primary, radius = radius * 0.55f, center = center)
                }
                is ControlSpec.StickZone -> {
                    drawCircle(
                        color = outline.copy(alpha = 0.35f),
                        radius = radius,
                        center = center,
                        style = Stroke(width = 3f),
                    )
                    val (ax, ay) = when (c.side) {
                        dev.hidgamepad.core.layout.StickSide.LEFT -> state.leftX to state.leftY
                        dev.hidgamepad.core.layout.StickSide.RIGHT -> state.rightX to state.rightY
                    }
                    val knob = Offset(
                        center.x + (ax / 127f) * radius * 0.6f,
                        center.y + (ay / 127f) * radius * 0.6f,
                    )
                    drawCircle(color = primary, radius = radius * 0.35f, center = knob)
                }
                is ControlSpec.TriggerZone -> {
                    val travel = when (c.side) {
                        dev.hidgamepad.core.layout.TriggerSide.LEFT -> state.leftTrigger
                        dev.hidgamepad.core.layout.TriggerSide.RIGHT -> state.rightTrigger
                    }
                    drawCircle(
                        color = outline.copy(alpha = 0.35f),
                        radius = radius,
                        center = center,
                        style = Stroke(width = 3f),
                    )
                    if (travel > 0) {
                        drawCircle(
                            color = primary.copy(alpha = 0.3f + 0.7f * (travel / 255f)),
                            radius = radius * (0.3f + 0.7f * (travel / 255f)),
                            center = center,
                        )
                    }
                }
                is ControlSpec.DpadZone -> {
                    drawCircle(
                        color = outline.copy(alpha = 0.35f),
                        radius = radius,
                        center = center,
                        style = Stroke(width = 3f),
                    )
                    val arm = radius * 0.85f
                    val thick = radius * 0.34f
                    drawLine(outline.copy(alpha = 0.35f), Offset(center.x - arm, center.y), Offset(center.x + arm, center.y), thick)
                    drawLine(outline.copy(alpha = 0.35f), Offset(center.x, center.y - arm), Offset(center.x, center.y + arm), thick)
                    if (state.hat in 0..7) {
                        val angle = Math.toRadians(state.hat * 45.0 - 90.0)
                        val dir = Offset(
                            center.x + (Math.cos(angle) * arm * 0.7).toFloat(),
                            center.y + (Math.sin(angle) * arm * 0.7).toFloat(),
                        )
                        drawCircle(color = primary, radius = thick * 0.7f, center = dir)
                    }
                }
            }
            // Label
            val text = measurer.measure(
                c.label,
                style = androidx.compose.ui.text.TextStyle(
                    color = labelColor.copy(alpha = 0.8f),
                    fontSize = (11 * labelScale).sp,
                    textAlign = TextAlign.Center,
                ),
            )
            drawText(
                text,
                topLeft = Offset(
                    center.x - text.size.width / 2f,
                    center.y + radius + 4f,
                ),
            )
        }
    }
}

@Composable
private fun ControlSemantics(controls: List<ControlSpec>, state: GamepadState, canvasSize: IntSize) {
    val container = LocalAppContainer.current
    val density = LocalDensity.current
    controls.forEach { c ->
        val sizePx = c.radius * 2 * canvasSize.width
        val sizeDp = with(density) { sizePx.toDp() }
        val xDp = with(density) { (c.center.x * canvasSize.width - sizePx / 2).toDp() }
        val yDp = with(density) { (c.center.y * canvasSize.height - sizePx / 2).toDp() }
        val stateText = when (c) {
            is ControlSpec.ToggleZone -> if (state.isButtonPressed(c.buttonNumber)) "on" else "off"
            is ControlSpec.ButtonZone -> if (state.isButtonPressed(c.buttonNumber)) "pressed" else "not pressed"
            else -> null
        }
        Box(
            modifier = Modifier
                .offset(x = xDp, y = yDp)
                .size(sizeDp)
                .semantics {
                    role = Role.Button
                    contentDescription = c.label
                    if (stateText != null) stateDescription = stateText
                    onClick(label = "activate") {
                        val now = System.currentTimeMillis()
                        container.engine.handle(ControlEvent.Down(c, 0f, 0f), now)
                        container.engine.handle(ControlEvent.Up(c), now + 30)
                        true
                    }
                },
        )
    }
}
