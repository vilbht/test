package dev.hidgamepad.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dev.hidgamepad.di.AppContainer
import dev.hidgamepad.ui.calibration.CalibrationScreen
import dev.hidgamepad.ui.connection.ConnectionScreen
import dev.hidgamepad.ui.gamepad.GamepadScreen
import dev.hidgamepad.ui.mapping.MappingScreen
import dev.hidgamepad.ui.profiles.ProfilesScreen
import dev.hidgamepad.ui.settings.SettingsScreen

val LocalAppContainer = staticCompositionLocalOf<AppContainer> {
    error("AppContainer not provided")
}

object Routes {
    const val GAMEPAD = "gamepad"
    const val CONNECTION = "connection"
    const val PROFILES = "profiles"
    const val MAPPING = "mapping"
    const val CALIBRATION = "calibration"
    const val SETTINGS = "settings"
}

@Composable
fun GamepadApp(container: AppContainer) {
    androidx.compose.runtime.CompositionLocalProvider(LocalAppContainer provides container) {
        val nav = rememberNavController()
        NavHost(navController = nav, startDestination = Routes.GAMEPAD) {
            composable(Routes.GAMEPAD) { GamepadScreen(onOpenMenu = { nav.navigate(Routes.CONNECTION) }) }
            composable(Routes.CONNECTION) {
                ConnectionScreen(
                    onBack = { nav.popBackStack(Routes.GAMEPAD, false) },
                    onOpenProfiles = { nav.navigate(Routes.PROFILES) },
                    onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                    onOpenCalibration = { nav.navigate(Routes.CALIBRATION) },
                )
            }
            composable(Routes.PROFILES) {
                ProfilesScreen(
                    onBack = { nav.popBackStack() },
                    onEdit = { name -> nav.navigate("${Routes.MAPPING}/$name") },
                )
            }
            composable("${Routes.MAPPING}/{name}") { entry ->
                MappingScreen(
                    profileName = entry.arguments?.getString("name").orEmpty(),
                    onBack = { nav.popBackStack() },
                )
            }
            composable(Routes.CALIBRATION) { CalibrationScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.SETTINGS) { SettingsScreen(onBack = { nav.popBackStack() }) }
        }
    }
}
