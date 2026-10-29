package za.co.pcremote.controller.keyboard

import android.app.Activity
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

class KeyboardSettingsActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var col: LinearLayout

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(48))
        }

        text("Elleson Keyboard", 26f, C.TEXT, 0)
        text("Set it up, then try it in the box.", 14f, C.TEXT_DIM, 4)
        text("Sign in to your PC in Elleson Connect. Once this keyboard is selected, copied text and pictures can sync while you use other apps. Your keyboard is never changed automatically.",14f,C.TEXT_DIM,8)

        button("1. Enable keyboard") {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }
        button("2. Choose keyboard") {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }
        button("Enable voice dictation") {requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO),910)}
        if(intent.getBooleanExtra("microphone",false))requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO),910)

        col.addView(EditText(this).apply {
            hint = "Type here to test"
            setTextColor(C.TEXT)
            setHintTextColor(C.TEXT_DIM)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(16) }
        })

        text("Settings", 20f, C.TEXT, 28)
        toggle("Show word suggestions", prefs.suggestions) { prefs.suggestions = it }
        toggle("Learn my frequently typed words", prefs.learnWords) { prefs.learnWords = it }
        button("Clear learned words") {
            prefs.learnedWords = ""
            Toast.makeText(this, "Learned words cleared", Toast.LENGTH_SHORT).show()
        }

        val heightLabel = text("Key height: ${prefs.keyHeight}", 15f, C.TEXT, 12)
        seek(26, prefs.keyHeight - 38) {
            prefs.keyHeight = it + 38
            heightLabel.text = "Key height: ${it + 38}"
        }

        val levels = listOf("Off", "Light", "Medium", "Strong")
        val vibLabel = text("Vibration: ${levels[prefs.vibration]}", 15f, C.TEXT, 16)
        seek(3, prefs.vibration) {
            prefs.vibration = it
            vibLabel.text = "Vibration: ${levels[it]}"
        }

        toggle("Key sounds", prefs.sound) { prefs.sound = it }
        toggle("Auto-capitalize", prefs.autoCap) { prefs.autoCap = it }
        toggle("Show number row", prefs.showNumberRow) { prefs.showNumberRow = it }

        text("Text shortcuts (one per line, like omw=on my way)", 15f, C.TEXT, 20)
        col.addView(EditText(this).apply {
            setText(prefs.shortcuts)
            setTextColor(C.TEXT)
            setHintTextColor(C.TEXT_DIM)
            hint = "omw=on my way"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 4
            gravity = Gravity.TOP
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, d: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, d: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    prefs.shortcuts = s?.toString() ?: ""
                }
            })
        })

        button("Clear clipboard history") {
            prefs.clips = emptyList()
            clearClipFiles(this)
            Toast.makeText(this, "Cleared", Toast.LENGTH_SHORT).show()
        }

        setContentView(ScrollView(this).apply {
            setBackgroundColor(C.BG)
            addView(col)
        })
    }

    private fun text(label: String, size: Float, color: Int, topDp: Int): TextView {
        val t = TextView(this)
        t.text = label
        t.setTextColor(color)
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        t.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(topDp) }
        col.addView(t)
        return t
    }

    private fun button(label: String, onClick: () -> Unit) {
        val t = TextView(this)
        t.text = label
        t.gravity = Gravity.CENTER
        t.setTextColor(C.ACCENT_TEXT)
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        val bg = GradientDrawable()
        bg.cornerRadius = dp(12).toFloat()
        bg.setColor(C.ACCENT)
        t.background = bg
        t.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(52)
        ).apply { topMargin = dp(12) }
        t.setOnClickListener { onClick() }
        col.addView(t)
    }

    private fun toggle(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
        val s = Switch(this)
        s.text = label
        s.setTextColor(C.TEXT)
        s.isChecked = value
        s.setOnCheckedChangeListener { _, on -> onChange(on) }
        s.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(16) }
        col.addView(s)
    }

    private fun seek(max: Int, value: Int, onChange: (Int) -> Unit) {
        val s = SeekBar(this)
        s.max = max
        s.progress = value
        s.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, p: Int, fromUser: Boolean) {
                onChange(p)
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })
        col.addView(s)
    }
}

