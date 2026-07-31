package dev.hidgamepad.data

import android.content.Context
import dev.hidgamepad.core.layout.LayoutProfile
import dev.hidgamepad.core.profile.ProfileJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Stores layout profiles as JSON files under filesDir/profiles. The JSON
 * document format is the share/export format too (see ProfileJson), so
 * import/export is just file content in/out.
 */
class ProfileRepository(context: Context) {

    private val dir = File(context.filesDir, "profiles").apply { mkdirs() }

    private val _profiles = MutableStateFlow(loadAll())
    val profiles: StateFlow<List<LayoutProfile>> = _profiles

    private fun fileFor(name: String) = File(dir, sanitize(name) + ".json")

    private fun sanitize(name: String) = name.replace(Regex("[^A-Za-z0-9._ -]"), "_")

    private fun loadAll(): List<LayoutProfile> =
        dir.listFiles { f -> f.extension == "json" }
            ?.mapNotNull { f -> runCatching { ProfileJson.decode(f.readText()) }.getOrNull() }
            ?.sortedBy { it.name }
            ?: emptyList()

    fun byName(name: String): LayoutProfile? = _profiles.value.firstOrNull { it.name == name }

    suspend fun save(profile: LayoutProfile) = withContext(Dispatchers.IO) {
        fileFor(profile.name).writeText(ProfileJson.encode(profile))
        _profiles.value = loadAll()
    }

    suspend fun delete(name: String) = withContext(Dispatchers.IO) {
        fileFor(name).delete()
        _profiles.value = loadAll()
    }

    /** Returns an error message, or null on success. */
    suspend fun import(jsonText: String): String? = withContext(Dispatchers.IO) {
        val profile = runCatching { ProfileJson.decode(jsonText) }.getOrElse {
            return@withContext "Not a valid profile: ${it.message}"
        }
        val problems = profile.validate()
        if (problems.isNotEmpty()) return@withContext problems.joinToString("; ")
        save(profile)
        null
    }

    fun export(profile: LayoutProfile): String = ProfileJson.encode(profile)
}
