package dev.hidgamepad.di

import android.content.Context
import dev.hidgamepad.bluetooth.ClassicHidTransport
import dev.hidgamepad.bluetooth.HidTransport
import dev.hidgamepad.core.hid.GamepadState
import dev.hidgamepad.core.input.FeedbackEdge
import dev.hidgamepad.core.input.InputEngine
import dev.hidgamepad.core.input.TouchRouterCore
import dev.hidgamepad.core.input.applyAccessibility
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.DefaultLayouts
import dev.hidgamepad.core.layout.LayoutProfile
import dev.hidgamepad.data.AppSettings
import dev.hidgamepad.data.ProfileRepository
import dev.hidgamepad.data.SettingsRepository
import dev.hidgamepad.feedback.HapticsController
import dev.hidgamepad.feedback.SoundController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Process-wide wiring (manual DI). The input engine and touch router are
 * confined to the main thread; the report-send loop runs in
 * HidDeviceService off the main thread, consuming [gamepadState].
 */
class AppContainer(context: Context) {

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val settingsRepository = SettingsRepository(context)
    val profileRepository = ProfileRepository(context)
    val haptics = HapticsController(context)
    val sound = SoundController()
    val transport: HidTransport = ClassicHidTransport(context)

    private val _gamepadState = MutableStateFlow(GamepadState.NEUTRAL)
    /** Live logical state: consumed by the UI (visuals) and the report loop. */
    val gamepadState: StateFlow<GamepadState> = _gamepadState

    val engine = InputEngine(object : InputEngine.Listener {
        override fun onStateChanged(state: GamepadState) {
            _gamepadState.value = state
        }

        override fun onFeedback(control: ControlSpec, edge: FeedbackEdge) {
            // Haptic + (optional, always redundant) sound dispatched together:
            // sound is structurally never the sole feedback channel.
            haptics.play(control, edge)
            sound.play(edge)
        }
    })

    val router = TouchRouterCore(engine)

    val settings: StateFlow<AppSettings> = settingsRepository.settings
        .stateIn(appScope, SharingStarted.Eagerly, AppSettings())

    /** The active profile after accessibility transforms — what the UI renders and routes with. */
    val activeLayout: StateFlow<LayoutProfile> =
        combine(settings, profileRepository.profiles) { s, profiles ->
            val base = s.activeProfile?.let { name -> profiles.firstOrNull { it.name == name } }
                ?: DefaultLayouts.freeDefault()
            base.applyAccessibility(s.engine)
        }.stateIn(appScope, SharingStarted.Eagerly, DefaultLayouts.freeDefault())

    init {
        appScope.launch {
            settings.collect { s ->
                engine.settings = s.engine
                haptics.enabled = s.hapticsEnabled
                haptics.identityPatterns = s.hapticIdentity
                sound.enabled = s.soundEnabled
            }
        }
        appScope.launch {
            activeLayout.collect { layout ->
                if (router.layout != layout) router.layout = layout
            }
        }
        // Long-press promotion tick (cheap; engine ignores it when idle).
        appScope.launch {
            while (isActive) {
                engine.onTick(System.currentTimeMillis())
                delay(50)
            }
        }
    }
}
