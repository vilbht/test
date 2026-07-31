package dev.hidgamepad

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import dev.hidgamepad.core.layout.LayoutMode
import dev.hidgamepad.ui.GamepadApp
import dev.hidgamepad.ui.theme.HidGamepadTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as GamepadApplication).container
        setContent {
            val settings by container.settings.collectAsState()
            val layout by container.activeLayout.collectAsState()

            // Case mode: keep the screen on and hide system bars so plungers
            // near the edges can't trigger gesture navigation.
            LaunchedEffect(layout.mode) {
                val insets = WindowCompat.getInsetsController(window, window.decorView)
                if (layout.mode == LayoutMode.CASE) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    insets.systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    insets.hide(WindowInsetsCompat.Type.systemBars())
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    insets.show(WindowInsetsCompat.Type.systemBars())
                }
            }

            HidGamepadTheme(
                highContrast = settings.highContrast,
                largeLabels = settings.largeLabels,
            ) {
                GamepadApp(container)
            }
        }
    }
}
