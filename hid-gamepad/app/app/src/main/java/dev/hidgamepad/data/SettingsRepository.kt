package dev.hidgamepad.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dev.hidgamepad.core.input.EngineSettings
import dev.hidgamepad.core.input.OneHandedMode
import dev.hidgamepad.core.input.ToggleMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * All user settings. [engine] feeds the input engine / layout transforms;
 * the rest drive theming and feedback.
 */
data class AppSettings(
    val engine: EngineSettings = EngineSettings(),
    // Vision
    val highContrast: Boolean = false,
    val largeLabels: Boolean = false,
    /** Distinct per-button haptic identity patterns (eyes-free play). */
    val hapticIdentity: Boolean = false,
    // Feedback
    val hapticsEnabled: Boolean = true,
    /** Sounds are always redundant to haptics/visuals, never the sole channel. */
    val soundEnabled: Boolean = false,
    /** Name of the active layout profile; null = built-in default. */
    val activeProfile: String? = null,
    /** MAC of the last connected host, for auto-reconnect. */
    val lastHostAddress: String? = null,
)

private val Context.dataStore by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {

    private object Keys {
        val stickyButtons = booleanPreferencesKey("sticky_buttons")
        val deadZone = floatPreferencesKey("dead_zone")
        val sensitivity = floatPreferencesKey("sensitivity")
        val longPressEnabled = booleanPreferencesKey("long_press_enabled")
        val longPressMs = longPreferencesKey("long_press_ms")
        val oneHanded = stringPreferencesKey("one_handed")
        val targetScale = floatPreferencesKey("target_scale")
        val toggleMode = stringPreferencesKey("toggle_mode")
        val analogSqueeze = booleanPreferencesKey("analog_squeeze")
        val highContrast = booleanPreferencesKey("high_contrast")
        val largeLabels = booleanPreferencesKey("large_labels")
        val hapticIdentity = booleanPreferencesKey("haptic_identity")
        val hapticsEnabled = booleanPreferencesKey("haptics_enabled")
        val soundEnabled = booleanPreferencesKey("sound_enabled")
        val activeProfile = stringPreferencesKey("active_profile")
        val lastHostAddress = stringPreferencesKey("last_host_address")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            engine = EngineSettings(
                stickyButtons = p[Keys.stickyButtons] ?: false,
                deadZone = p[Keys.deadZone] ?: 0.15f,
                sensitivity = p[Keys.sensitivity] ?: 1.0f,
                longPressEnabled = p[Keys.longPressEnabled] ?: false,
                longPressMs = p[Keys.longPressMs] ?: 400,
                oneHanded = p[Keys.oneHanded]?.let { runCatching { OneHandedMode.valueOf(it) }.getOrNull() }
                    ?: OneHandedMode.OFF,
                targetScale = p[Keys.targetScale] ?: 1.0f,
                toggleMode = p[Keys.toggleMode]?.let { runCatching { ToggleMode.valueOf(it) }.getOrNull() }
                    ?: ToggleMode.FOLLOW,
                analogSqueeze = p[Keys.analogSqueeze] ?: false,
            ),
            highContrast = p[Keys.highContrast] ?: false,
            largeLabels = p[Keys.largeLabels] ?: false,
            hapticIdentity = p[Keys.hapticIdentity] ?: false,
            hapticsEnabled = p[Keys.hapticsEnabled] ?: true,
            soundEnabled = p[Keys.soundEnabled] ?: false,
            activeProfile = p[Keys.activeProfile],
            lastHostAddress = p[Keys.lastHostAddress],
        )
    }

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        context.dataStore.edit { p ->
            val current = AppSettings(
                engine = EngineSettings(
                    stickyButtons = p[Keys.stickyButtons] ?: false,
                    deadZone = p[Keys.deadZone] ?: 0.15f,
                    sensitivity = p[Keys.sensitivity] ?: 1.0f,
                    longPressEnabled = p[Keys.longPressEnabled] ?: false,
                    longPressMs = p[Keys.longPressMs] ?: 400,
                    oneHanded = p[Keys.oneHanded]?.let { runCatching { OneHandedMode.valueOf(it) }.getOrNull() }
                        ?: OneHandedMode.OFF,
                    targetScale = p[Keys.targetScale] ?: 1.0f,
                    toggleMode = p[Keys.toggleMode]?.let { runCatching { ToggleMode.valueOf(it) }.getOrNull() }
                        ?: ToggleMode.FOLLOW,
                    analogSqueeze = p[Keys.analogSqueeze] ?: false,
                ),
                highContrast = p[Keys.highContrast] ?: false,
                largeLabels = p[Keys.largeLabels] ?: false,
                hapticIdentity = p[Keys.hapticIdentity] ?: false,
                hapticsEnabled = p[Keys.hapticsEnabled] ?: true,
                soundEnabled = p[Keys.soundEnabled] ?: false,
                activeProfile = p[Keys.activeProfile],
                lastHostAddress = p[Keys.lastHostAddress],
            )
            val s = transform(current)
            p[Keys.stickyButtons] = s.engine.stickyButtons
            p[Keys.deadZone] = s.engine.deadZone
            p[Keys.sensitivity] = s.engine.sensitivity
            p[Keys.longPressEnabled] = s.engine.longPressEnabled
            p[Keys.longPressMs] = s.engine.longPressMs
            p[Keys.oneHanded] = s.engine.oneHanded.name
            p[Keys.targetScale] = s.engine.targetScale
            p[Keys.toggleMode] = s.engine.toggleMode.name
            p[Keys.analogSqueeze] = s.engine.analogSqueeze
            p[Keys.highContrast] = s.highContrast
            p[Keys.largeLabels] = s.largeLabels
            p[Keys.hapticIdentity] = s.hapticIdentity
            p[Keys.hapticsEnabled] = s.hapticsEnabled
            p[Keys.soundEnabled] = s.soundEnabled
            val active = s.activeProfile
            if (active == null) p.remove(Keys.activeProfile) else p[Keys.activeProfile] = active
            val host = s.lastHostAddress
            if (host == null) p.remove(Keys.lastHostAddress) else p[Keys.lastHostAddress] = host
        }
    }
}
