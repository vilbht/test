// Root build file. Plugins are declared per-module so that the pure-JVM
// :core module can be built and tested in environments without access to
// Google's Maven repository (the Android Gradle Plugin is only resolved
// when :app is configured — see settings.gradle.kts).
