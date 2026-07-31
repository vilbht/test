# kotlinx.serialization keeps for release builds
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class dev.hidgamepad.core.** {
    *** Companion;
}
-keepclasseswithmembers class dev.hidgamepad.core.** {
    kotlinx.serialization.KSerializer serializer(...);
}
