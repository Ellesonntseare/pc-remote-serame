package za.co.pcremote.controller

import android.annotation.SuppressLint
import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.projection.MediaProjectionManager
import android.os.Build
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
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import java.net.URI

/** Personal PC client with explicit, Android-approved guest screen sharing. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var connectScreen: ScrollView
    private lateinit var error: TextView
    private lateinit var address: EditText
    private lateinit var portField: EditText
    private var selectedOrigin: String? = null
    private var shareReply: JavaScriptReplyProxy? = null
    private var pendingProjection = false
    private var bridgeInstalled = false

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
            if (!TrustedOrigin.privateIp(ip) || port == null || port !in 1..65535) {
                error.text = "Use your PC's private IPv4 address and a port from 1 to 65535."
                return@setOnClickListener
            }
            prefs.edit().putString("ip", ip).putInt("port", port).apply()
            error.text = ""
            connectTo("http://$ip:$port")
        }
        findViewById<Button>(R.id.connectWebsite).setOnClickListener { connectTo("https://remote.teamtrader.co.za") }
        ScreenShareService.events = { value -> runCatching { shareReply?.postMessage(value.toString()) }; Unit }
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
                pendingProjection = false; ScreenShareService.stopSharing(); shareReply = null
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

    private fun connectTo(origin: String) {
        selectedOrigin = TrustedOrigin.normalize(origin) ?: return
        if (bridgeInstalled) WebViewCompat.removeWebMessageListener(web, "PCRAndroid")
        bridgeInstalled = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        if (bridgeInstalled) WebViewCompat.addWebMessageListener(web, "PCRAndroid", setOf(selectedOrigin!!)) { view, message, sourceOrigin, isMainFrame, reply ->
            if (!isMainFrame || TrustedOrigin.normalize(sourceOrigin.toString()) != selectedOrigin || !isAllowed(view.url ?: "")) return@addWebMessageListener
            try {
                val value = JSONObject(message.data ?: "{}")
                when (value.optString("type")) {
                    "start" -> {
                        if (pendingProjection) return@addWebMessageListener
                        val cookie = CookieManager.getInstance().getCookie(selectedOrigin!!).orEmpty()
                        if (!cookie.contains("pc_remote_session=")) { reply.postMessage("{\"type\":\"stopped\",\"message\":\"Sign in as an approved guest first.\"}"); return@addWebMessageListener }
                        shareReply = reply; pendingProjection = true
                        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 501)
                        else requestProjection()
                    }
                    "stop" -> { pendingProjection = false; ScreenShareService.stopSharing() }
                    "mark" -> ScreenShareService.forwardMark(value)
                }
            } catch (_: Exception) { reply.postMessage("{\"type\":\"stopped\",\"message\":\"Could not start phone sharing.\"}") }
        }
        error.text = ""; connectScreen.visibility = View.GONE; web.visibility = View.VISIBLE; web.requestFocus(); web.loadUrl("$selectedOrigin/")
    }

    @Suppress("DEPRECATION")
    private fun requestProjection() {
        if (!pendingProjection || !isAllowed(web.url ?: "")) return
        startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), 502)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 501) requestProjection()
    }
    @Deprecated("MediaProjection consent result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 502) return
        val requested = pendingProjection; pendingProjection = false
        if (!requested || !isAllowed(web.url ?: "")) return
        if (resultCode != RESULT_OK || data == null) { shareReply?.postMessage("{\"type\":\"stopped\",\"message\":\"Screen-sharing permission was cancelled.\"}"); return }
        val cookie = CookieManager.getInstance().getCookie(selectedOrigin!!).orEmpty()
        val intent = Intent(this, ScreenShareService::class.java).putExtra("origin", selectedOrigin).putExtra("cookie", cookie).putExtra("consent", data).putExtra("resultCode", resultCode)
        startForegroundService(intent)
    }

    private fun isAllowed(url: String): Boolean {
        val expected = selectedOrigin ?: return false
        return TrustedOrigin.normalize(url) == expected
    }

    private fun showConnect(message: String) {
        pendingProjection = false; ScreenShareService.stopSharing()
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
        pendingProjection = false; ScreenShareService.stopSharing(); ScreenShareService.events = null; shareReply = null
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
}
