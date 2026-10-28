package za.co.pcremote.controller.keyboard

import android.content.Context
import org.json.JSONArray

object C {
    val BG = 0xFF171B1E.toInt()
    val BAR = 0xFF252B2F.toInt()
    val KEY = 0xFF343C40.toInt()
    val KEY_DOWN = 0xFF526066.toInt()
    val SPECIAL = 0xFF273034.toInt()
    val ACCENT = 0xFF3EAD75.toInt()
    val ACCENT_DOWN = 0xFF348D61.toInt()
    val TEXT = 0xFFF5F8F6.toInt()
    val TEXT_DIM = 0xFFB6C3BE.toInt()
    val ACCENT_TEXT = 0xFF0B2418.toInt()
}

class Prefs(context: Context) {
    private val sp = context.applicationContext
        .getSharedPreferences("serame_prefs", Context.MODE_PRIVATE)

    var keyHeight: Int
        get() = sp.getInt("keyHeight", 46)
        set(v) { sp.edit().putInt("keyHeight", v).apply() }

    // 0 off, 1 light, 2 medium, 3 strong
    var vibration: Int
        get() = sp.getInt("vibration", 1)
        set(v) { sp.edit().putInt("vibration", v).apply() }

    var sound: Boolean
        get() = sp.getBoolean("sound", false)
        set(v) { sp.edit().putBoolean("sound", v).apply() }

    var autoCap: Boolean
        get() = sp.getBoolean("autoCap", true)
        set(v) { sp.edit().putBoolean("autoCap", v).apply() }

    var suggestions: Boolean
        get() = sp.getBoolean("suggestions", true)
        set(v) { sp.edit().putBoolean("suggestions", v).apply() }
    var learnWords: Boolean
        get() = sp.getBoolean("learnWords", true)
        set(v) { sp.edit().putBoolean("learnWords", v).apply() }
    var learnedWords: String
        get() = sp.getString("learnedWords", "").orEmpty()
        set(v) { sp.edit().putString("learnedWords", v).apply() }

    var showNumberRow: Boolean
        get() = sp.getBoolean("showNumberRow", true)
        set(v) { sp.edit().putBoolean("showNumberRow", v).apply() }

    // 0 off, 1 left, 2 right
    var oneHanded: Int
        get() = sp.getInt("oneHanded", 0)
        set(v) { sp.edit().putInt("oneHanded", v).apply() }

    var shortcuts: String
        get() = sp.getString("shortcuts", "omw=on my way\nbrb=be right back\nidk=I don't know") ?: ""
        set(v) { sp.edit().putString("shortcuts", v).apply() }

    var clips: List<String>
        get() = try {
            val a = JSONArray(sp.getString("clips", "[]"))
            List(a.length()) { a.getString(it) }
        } catch (e: Exception) {
            emptyList()
        }
        set(v) { sp.edit().putString("clips", JSONArray(v).toString()).apply() }
}

// Image clips are stored in the clip list as IMG_PREFIX + file name.
const val IMG_PREFIX = "\u0001IMG:"

fun isImageClip(s: String) = s.startsWith(IMG_PREFIX)

fun imageNameOf(s: String) = s.removePrefix(IMG_PREFIX)

fun clearClipFiles(context: Context) {
    java.io.File(context.filesDir, "clips").listFiles()?.forEach { if(!za.co.pcremote.controller.DeviceCompanion.ownsClipboardFile(it.name))it.delete() }
}

