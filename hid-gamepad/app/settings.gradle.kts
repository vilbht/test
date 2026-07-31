pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "hid-gamepad"

include(":core")

// Pass -PcoreOnly (or set it in gradle.properties) to skip the Android app
// module — useful on machines that cannot reach Google's Maven repository
// or have no Android SDK. CI and normal dev builds include :app.
if (!providers.gradleProperty("coreOnly").isPresent) {
    include(":app")
}
