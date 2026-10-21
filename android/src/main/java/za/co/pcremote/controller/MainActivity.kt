package za.co.pcremote.controller

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import java.net.URI

/** A LAN-only client. All power, screen and input requests go to the user's own Windows PC.
 * No cloud relay, no background capture, no Android accessibility service.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var connectScreen: ScrollView
    private lateinit var error: TextView
    private lateinit var address: EditText
    private lateinit var portField: EditText
    private var selectedOrigin: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        connectScreen = findViewById(R.id.connectScreen)
        web = findViewById(R.id.web)
        error = findViewById(R.id.error)
        address = findViewById(R.id.ipAddress)
        portField = findViewById(R.id.port)
        val prefs = getSharedPreferences("pc_remote_android", MODE_PRIVATE)
        address.setText(prefs.getString("ip", ""))
        portField.setText(prefs.getInt("port", 7666).toString())
        findViewById<Button>(R.id.connect).setOnClickListener {
            val ip = address.text.toString().trim()
            val port = portField.text.toString().toIntOrNull()
            if (!isPrivateIpv4(ip) || port == null || port !in 1..65535) {
                error.text = "Use your PC's private IPv4 address and a port from 1 to 65535."
                return@setOnClickListener
            }
            prefs.edit().putString("ip", ip).putInt("port", port).apply()
            error.text = ""
            selectedOrigin = "http://$ip:$port"
            connectScreen.visibility = View.GONE
            web.visibility = View.VISIBLE
            web.requestFocus()
            web.loadUrl("$selectedOrigin/")
        }
        // Allow the user-initiated Keyboard button in the WebView to focus
        // its visible textarea and summon the Android IME normally.
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        val settings = web.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Do not navigate to anything outside this one private PC's origin.
                return !isAllowed(request.url.toString())
            }
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                if (url != "about:blank" && !isAllowed(url)) { view.stopLoading(); showConnect("Blocked a non-local URL.") }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, e: WebResourceError) {
                if (request.isForMainFrame) showConnect("Can't reach the PC. Check the Wi-Fi, IP, port and that start.bat is running.")
            }
        }
        if (savedInstanceState != null) {
            // Reconnect manually after process death; never resume a stale control session.
            showConnect("")
        }
    }

    private fun isAllowed(url: String): Boolean {
        val expected = selectedOrigin ?: return false
        return try {
            val uri = URI(url)
            val origin = "${uri.scheme}://${uri.host}:${uri.port}"
            uri.scheme == "http" && origin == expected && uri.userInfo == null
        } catch (_: Exception) { false }
    }

    private fun isPrivateIpv4(text: String): Boolean {
        if (!Regex("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$").matches(text)) return false
        val x = text.split('.').mapNotNull { it.toIntOrNull() }
        if (x.size != 4 || x.any { it !in 0..255 }) return false
        return x[0] == 10 || (x[0] == 172 && x[1] in 16..31) || (x[0] == 192 && x[1] == 168)
    }

    private fun showConnect(message: String) {
        web.stopLoading()
        web.loadUrl("about:blank")
        web.visibility = View.GONE
        connectScreen.visibility = View.VISIBLE
        error.text = message
    }

    @Deprecated("Android navigation compatibility")
    override fun onBackPressed() {
        if (web.visibility != View.VISIBLE) {
            super.onBackPressed()
            return
        }
        // First Android back exits the remote desktop, next one returns to the PC address screen.
        web.evaluateJavascript("typeof rs!=='undefined' && rs.on ? (rsClose(), 'closed') : 'home'") { result ->
            if (result == "\"home\"") showConnect("")
        }
    }

    override fun onDestroy() {
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
}
