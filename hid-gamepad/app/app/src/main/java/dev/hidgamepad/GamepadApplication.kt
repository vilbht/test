package dev.hidgamepad

import android.app.Application
import dev.hidgamepad.di.AppContainer

class GamepadApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
