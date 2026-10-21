package za.co.pcremote.controller

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.projection.MediaProjectionManager
import android.media.projection.MediaProjectionConfig
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.net.Uri
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
    private var controlDialog: AlertDialog? = null
    private var microphoneRequest: PermissionRequest? = null
    private var filesResult: ValueCallback<Array<Uri>>? = null

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
        val wakeMac=findViewById<EditText>(R.id.wakeMac);wakeMac.setText(prefs.getString("wakeMac",""))
        findViewById<Button>(R.id.wakePc).setOnClickListener { button ->
            val mac=wakeMac.text.toString().trim();button.isEnabled=false
            Thread{val message=try{WakeOnLan.send(mac);prefs.edit().putString("wakeMac",mac).apply();"Wake signal sent. Wait for the PC, then connect."}catch(e:Exception){e.message?:"Could not send the wake signal."};runOnUiThread{error.text=message;button.isEnabled=true}}.start()
        }
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
        ScreenShareService.events = { value ->
            runCatching { shareReply?.postMessage(value.toString()) }
            if(value.optString("type")=="control-request")showControlRequest()
            if(value.optString("type")=="control-state" && value.optString("state")=="off"){controlDialog?.dismiss();controlDialog=null}
            Unit
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
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if(!isAllowed(request.origin.toString()) || request.resources.any{it!=PermissionRequest.RESOURCE_AUDIO_CAPTURE}){request.deny();return@runOnUiThread}
                    if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    else {microphoneRequest?.deny();microphoneRequest=request;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),503)}
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest) { if(microphoneRequest===request)microphoneRequest=null }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if(!isAllowed(view.url?:""))return false
                filesResult?.onReceiveValue(null);filesResult=callback
                return try{startActivityForResult(params.createIntent(),504);true}catch(_:Exception){filesResult=null;callback.onReceiveValue(null);true}
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Do not navigate to anything outside this one private PC's origin.
                return !isAllowed(request.url.toString())
            }
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                microphoneRequest?.deny();microphoneRequest=null;filesResult?.onReceiveValue(null);filesResult=null
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
                    "control-stop" -> ScreenShareService.stopPhoneControl()
                }
            } catch (_: Exception) { reply.postMessage("{\"type\":\"stopped\",\"message\":\"Could not start phone sharing.\"}") }
        }
        error.text = ""; connectScreen.visibility = View.GONE; web.visibility = View.VISIBLE; web.requestFocus(); web.loadUrl("$selectedOrigin/")
    }

    @Suppress("DEPRECATION")
    private fun requestProjection() {
        if (!pendingProjection || !isAllowed(web.url ?: "")) return
        val manager = getSystemService(MediaProjectionManager::class.java)
        // Android 14 otherwise defaults to an app-only chooser. Request the
        // complete display so Home, other apps and rotation remain in the stream.
        val request = if (Build.VERSION.SDK_INT >= 34)
            manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        else manager.createScreenCaptureIntent()
        startActivityForResult(request, 502)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 501) requestProjection()
        if(requestCode==503){val request=microphoneRequest;microphoneRequest=null;if(request!=null){if(grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED&&isAllowed(request.origin.toString())&&isAllowed(web.url?:""))request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()}}
    }
    @Deprecated("MediaProjection consent result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if(requestCode==504){val callback=filesResult;filesResult=null;callback?.onReceiveValue(if(isAllowed(web.url?:""))WebChromeClient.FileChooserParams.parseResult(resultCode,data)else null);return}
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
        microphoneRequest?.deny();microphoneRequest=null;filesResult?.onReceiveValue(null);filesResult=null
        controlDialog?.dismiss();controlDialog=null
        pendingProjection = false; ScreenShareService.stopSharing(); ScreenShareService.events = null; shareReply = null
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        ScreenShareService.previewEnabled = true
    }

    override fun onStop() {
        // Only the in-app thumbnail pauses. The foreground service owns both
        // capture and the network connection while the user opens other apps.
        ScreenShareService.previewEnabled = false
        super.onStop()
    }

    private fun showControlRequest() {
        val id=ScreenShareService.pendingControl()?:return
        if(!hasWindowFocus() || isFinishing || controlDialog?.isShowing==true)return
        val enabled=PhoneControlService.instance!=null
        controlDialog=AlertDialog.Builder(this).setTitle("Allow Serame to control this phone?")
            .setMessage(if(enabled)"Allow taps, swipes, Back, Home and replacing text in selected fields for this session (up to 10 minutes). Stop control anytime from the sharing notification." else "Phone control needs the PC Remote phone control Accessibility service. Enable it in Android settings, then return here and approve this request. Screen sharing can continue without control.")
            .setNegativeButton("Decline"){_,_->ScreenShareService.respondControl(id,false);controlDialog=null}
            .setPositiveButton(if(enabled)"Allow control" else "Open settings"){_,_->
                controlDialog=null
                if(enabled)ScreenShareService.respondControl(id,true) else startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }.setOnCancelListener{ScreenShareService.respondControl(id,false);controlDialog=null}.create()
        controlDialog?.show()
    }
    override fun onResume() { super.onResume();web.postDelayed({showControlRequest()},400) }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus);if(hasFocus)web.post{showControlRequest()} }
}
