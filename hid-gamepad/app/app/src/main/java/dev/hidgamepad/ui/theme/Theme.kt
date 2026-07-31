package dev.hidgamepad.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/** Label scale token consumed by control composables (vision accessibility). */
val LocalLabelScale = compositionLocalOf { 1f }

private val DarkScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFF4ECCA3),
    onPrimary = Color(0xFF00382A),
    secondary = Color(0xFF8AB4F8),
    background = Color(0xFF12161C),
    surface = Color(0xFF1B2430),
    onBackground = Color(0xFFE6EAF0),
    onSurface = Color(0xFFE6EAF0),
)

private val LightScheme: ColorScheme = lightColorScheme(
    primary = Color(0xFF00795C),
    secondary = Color(0xFF3B6BB0),
)

/**
 * High-contrast scheme: WCAG-checked pairs, state never conveyed by hue
 * alone (controls also change fill/outline thickness on press).
 */
private val HighContrastScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFFFFFF00),
    onPrimary = Color(0xFF000000),
    secondary = Color(0xFF00FFFF),
    onSecondary = Color(0xFF000000),
    background = Color(0xFF000000),
    surface = Color(0xFF000000),
    onBackground = Color(0xFFFFFFFF),
    onSurface = Color(0xFFFFFFFF),
    outline = Color(0xFFFFFFFF),
)

@Composable
fun HidGamepadTheme(
    highContrast: Boolean,
    largeLabels: Boolean,
    content: @Composable () -> Unit,
) {
    val scheme = when {
        highContrast -> HighContrastScheme
        isSystemInDarkTheme() -> DarkScheme
        else -> LightScheme
    }
    CompositionLocalProvider(LocalLabelScale provides if (largeLabels) 1.6f else 1f) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
