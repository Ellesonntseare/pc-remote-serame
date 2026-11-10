package za.co.pcremote.controller

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.Manifest
import android.content.Intent
import android.content.ClipboardManager
import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.projection.MediaProjectionManager
import android.media.projection.MediaProjectionConfig
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
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
import android.widget.Toast
import android.view.KeyEvent
import android.view.HapticFeedbackConstants
import android.view.inputmethod.InputMethodManager
import android.os.SystemClock
import android.webkit.URLUtil
import java.net.HttpURLConnection
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.JavaScriptReplyProxy
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
    private var volumeControlEnabled = false
    private var lastHaptic = 0L
    private var downloadRequest: Pair<String, String>? = null
    private var screenshotBytes: ByteArray? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var connectionGeneration = 0
    private var nearby:NearbyComputers?=null
    private val nearbyTargets=linkedSetOf<String>()
    private var fastLocalPending=false
    private var fastRouteGeneration=0
    private var appForeground=false
    private var clipboardDirty=true
    private var companionObserver:(()->Unit)?=null
    private var pendingShortcut=""
    private var pendingSyncFolder:JSONObject?=null
    private var keyboardGeneration=0
    private var phoneKeyboardRequested=false
    private var phoneKeyboardVisible=false
    private var homeMiniReady=false
    private var homeMiniWidth=16
    private var homeMiniHeight=9
    private var remoteFullscreenActive=false
    private var externalActivity=false
    private val clipboardListener=ClipboardManager.OnPrimaryClipChangedListener{clipboardDirty=true}
    private var localMedia:LocalMediaCapture?=null
    private var pendingLocalMedia:JSONObject?=null
    private var localMediaId=""
    private var pendingPhoneAudio:String?=null
    private var phoneAudioOutput="speakers"
    private var pendingPhoneAudioVolume=.6
    private var compressedPhoneAudio=true
    private var transferDestination=""
    private val sharedUris=mutableListOf<Uri>()
    private var sharedText=""
    private var openFilesOnReady=false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        connectScreen = findViewById(R.id.connectScreen)
        web = findViewById(R.id.web)
        window.decorView.viewTreeObserver.addOnGlobalLayoutListener {
            val visible=ViewCompat.getRootWindowInsets(window.decorView)?.isVisible(WindowInsetsCompat.Type.ime())==true
            if(visible!=phoneKeyboardVisible){
                if(!visible&&phoneKeyboardVisible){phoneKeyboardRequested=false;keyboardGeneration++}
                phoneKeyboardVisible=visible
                applySystemBars()
            }
        }
        error = findViewById(R.id.error)
        FolderSync.events={runOnUiThread{folderSyncEvent()}}
        (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).addPrimaryClipChangedListener(clipboardListener)
        findViewById<TextView>(R.id.appVersion).text="Elleson Connect "+packageManager.getPackageInfo(packageName,0).versionName.orEmpty()
        address = findViewById(R.id.ipAddress)
        portField = findViewById(R.id.port)
        // An IP is text, not a decimal number. Numeric decimal key listeners
        // silently reject the second and third dots on several Android IMEs.
        address.inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        val prefs = getSharedPreferences("pc_remote_android", MODE_PRIVATE)
        if(!prefs.contains("syncDeviceId"))prefs.edit().putString("syncDeviceId",java.util.UUID.randomUUID().toString()).apply()
        address.setText(prefs.getString("ip", ""))
        portField.setText(prefs.getInt("port", 7666).toString())
        findViewById<Button>(R.id.addressDot).setOnClickListener {
            address.requestFocus();val text=address.text;val start=address.selectionStart.coerceAtLeast(0);val end=address.selectionEnd.coerceAtLeast(start);text.replace(start,end,".");address.setSelection((start+1).coerceAtMost(text.length))
        }
        findViewById<Button>(R.id.addressPaste).setOnClickListener {
            val clipboard=getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            val text=clipboard.primaryClip?.takeIf{it.itemCount>0}?.getItemAt(0)?.coerceToText(this)?.toString()?.trim().orEmpty()
            if(text.isNotBlank()){address.setText(text.take(160));address.setSelection(address.text.length);address.requestFocus()}else error.text="Copy your PC's IP address first."
        }
        nearby=NearbyComputers(this){value->runOnUiThread{if(value.optString("state")=="found"){TrustedOrigin.normalize("http://"+value.optString("address")+":"+value.optInt("port",7666))?.let{target->nearbyTargets.add(target);while(nearbyTargets.size>32)nearbyTargets.remove(nearbyTargets.first())}};nearbyEvent(value)}}
        findViewById<Button>(R.id.nearbyScan).setOnClickListener{nearby?.start()}
        findViewById<Button>(R.id.modeLocal).setOnClickListener{selectConnectionMode(false);nearby?.start()}
        findViewById<Button>(R.id.modeWebsite).setOnClickListener{selectConnectionMode(true)}
        findViewById<Button>(R.id.portToggle).setOnClickListener{val panel=findViewById<View>(R.id.portOptions);panel.visibility=if(panel.visibility==View.VISIBLE)View.GONE else View.VISIBLE}
        selectConnectionMode(prefs.getBoolean("websiteMode",false))
        findViewById<Button>(R.id.portToggle).text="Port "+portField.text+" · Change"
        val connectEditor=TextView.OnEditorActionListener{_,action,event->if(action==EditorInfo.IME_ACTION_GO||event?.keyCode==KeyEvent.KEYCODE_ENTER&&event.action==KeyEvent.ACTION_DOWN){findViewById<Button>(R.id.connect).performClick();true}else false}
        address.setOnEditorActionListener(connectEditor);portField.setOnEditorActionListener(connectEditor)
        val wakeMac=findViewById<EditText>(R.id.wakeMac);wakeMac.setText(prefs.getString("wakeMac",""))
        findViewById<Button>(R.id.wakeOptions).setOnClickListener { button ->
            val options=findViewById<View>(R.id.wakeOptionsPanel);val show=options.visibility!=View.VISIBLE;options.visibility=if(show)View.VISIBLE else View.GONE;(button as Button).text=if(show)"Wake-on-LAN  −" else "Wake-on-LAN  +"
        }
        findViewById<Button>(R.id.wakePc).setOnClickListener { button ->
            val mac=wakeMac.text.toString().trim();button.isEnabled=false
            Thread{val message=try{WakeOnLan.send(mac);prefs.edit().putString("wakeMac",mac).apply();"Wake signal sent. Wait for the PC, then connect."}catch(e:Exception){e.message?:"Could not send the wake signal."};runOnUiThread{error.text=message;button.isEnabled=true}}.start()
        }
        findViewById<Button>(R.id.connect).setOnClickListener {
            startLocalConnection(address.text.toString(),portField.text.toString().trim().toIntOrNull()?:7666)
        }
        findViewById<Button>(R.id.connectWebsite).setOnClickListener { connectTo("https://remote.teamtrader.co.za") }
        PhoneAudioService.events={value->runOnUiThread{if(!isFinishing&&!isDestroyed&&value.optString("origin")==selectedOrigin&&isAllowed(web.url?:""))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:phone-audio',{detail:$value}))",null)}}
        TransferService.events={value->runOnUiThread{if(!isFinishing&&!isDestroyed&&value.optString("origin")==selectedOrigin&&isAllowed(web.url?:""))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:transfer-queue',{detail:$value}))",null)}}
        AppUpdateService.events={value->runOnUiThread{if(!isFinishing&&!isDestroyed&&value.optString("origin")==selectedOrigin&&isAllowed(web.url?:""))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:app-update',{detail:$value}))",null)}}
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
        // The system picker grants access to the selected content:// document.
        // Keep file:// and cross-origin file access disabled.
        settings.allowContentAccess = true
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportMultipleWindows(false)
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.setDownloadListener { url, _, disposition, mime, _ ->
            val parsed=runCatching{Uri.parse(url)}.getOrNull()
            if(!isAllowed(url)||parsed?.path !in listOf("/api/files/download","/api/files/folder"))return@setDownloadListener
            if(downloadRequest!=null){Toast.makeText(this,"Finish choosing where to save first.",Toast.LENGTH_SHORT).show();return@setDownloadListener}
            val name=try{DownloadNames.resolve(url,disposition,URLUtil.guessFileName(url,disposition,mime))}catch(e:IllegalArgumentException){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();return@setDownloadListener}
            downloadRequest=Pair(url,name)
            try{startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(if(mime.isNullOrBlank()||mime=="application/octet-stream") android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.',"").lowercase())?:"application/octet-stream" else mime).putExtra(Intent.EXTRA_TITLE,name),505)}catch(_:Exception){downloadRequest=null;Toast.makeText(this,"No file-saving app is available.",Toast.LENGTH_LONG).show()}
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val permissions=mediaPermissions(request)
                    if(permissions==null||!isAllowed(web.url?:"")){request.deny();return@runOnUiThread}
                    val missing=permissions.filter{checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED}
                    if(missing.isEmpty())grantWebMedia(request)
                    else {microphoneRequest?.deny();microphoneRequest=request;requestPermissions(missing.toTypedArray(),503)}
                }
            }
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if(fullscreenView!=null||!isAllowed(web.url?:"")){callback.onCustomViewHidden();return}
                fullscreenView=view;fullscreenCallback=callback
                (findViewById<View>(android.R.id.content) as ViewGroup).addView(view,ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT))
                // Keep canvas/WebCodecs streams alive under the full-screen surface.
                web.visibility=View.VISIBLE;applySystemBars()
            }
            override fun onHideCustomView(){hideFullscreen()}
            override fun onPermissionRequestCanceled(request: PermissionRequest) { if(microphoneRequest===request)microphoneRequest=null }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if(!isAllowed(view.url?:"")){callback.onReceiveValue(null);return true}
                filesResult?.onReceiveValue(null);filesResult=callback
                val types=params.acceptTypes.flatMap{it.split(',')}.map{it.trim()}.filter{Regex("^[a-zA-Z0-9.+*-]+/[a-zA-Z0-9.+*-]+$").matches(it)}.distinct().take(30)
                fun picker(action:String)=Intent(action).addCategory(Intent.CATEGORY_OPENABLE).setType(if(types.size==1)types[0]else "*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply{
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.mode==FileChooserParams.MODE_OPEN_MULTIPLE)
                    if(types.size>1)putExtra(Intent.EXTRA_MIME_TYPES,types.toTypedArray())
                }
                try{startActivityForResult(picker(Intent.ACTION_OPEN_DOCUMENT),504)}catch(_:Exception){
                    try{startActivityForResult(picker(Intent.ACTION_GET_CONTENT),504)}catch(_:Exception){filesResult=null;callback.onReceiveValue(null);Toast.makeText(this@MainActivity,"Android's file picker could not open. Enable the Files app and try again.",Toast.LENGTH_LONG).show()}
                }
                return true
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Do not navigate to anything outside this one private PC's origin.
                return !isAllowed(request.url.toString())
            }
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                volumeControlEnabled=false;
                microphoneRequest?.deny();microphoneRequest=null;filesResult?.onReceiveValue(null);filesResult=null
                stopLocalMedia();pendingPhoneAudio=null;PhoneAudioService.stop();pendingProjection = false; ScreenShareService.stopSharing(); shareReply = null
                if (url != "about:blank" && !isAllowed(url)) { view.stopLoading(); showConnect("Blocked a non-local URL.") }
            }
            override fun onPageFinished(view: WebView, url: String) {
                if(isAllowed(url)){val capabilities=JSONObject().put("localConnection",true).put("localDiscovery",true).put("clipboardSync",true).put("sharedClipboard",true).put("serameKeyboard",true).put("folderSync",true).put("widgets",true).put("homeMiniWindow",true).put("remoteFullscreen",true).put("miniWindow",packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)).put("virtualMicOutput",true).put("deviceId",prefs.getString("syncDeviceId","")).put("deviceName",android.os.Build.MANUFACTURER+" "+android.os.Build.MODEL).put("localMedia",true).put("phoneAudio",true).put("phonePlaybackAudio",Build.VERSION.SDK_INT>=29).put("nativeTransfers",true).put("transferActions",true).put("appUpdates",true).put("secondScreen",true).put("fastLocal",true).put("secondScreenPreferences",runCatching{JSONObject(prefs.getString("secondScreenPreferences","{}")?:"{}")}.getOrDefault(JSONObject())).put("displayWidth",resources.displayMetrics.widthPixels).put("displayHeight",resources.displayMetrics.heightPixels).put("smooth60",SecondScreenDevice.supports60(this@MainActivity)).put("version",packageManager.getPackageInfo(packageName,0).versionName);view.evaluateJavascript("window.PCRNativeCapabilities=$capabilities;window.dispatchEvent(new Event('pcr:native-ready'));",null);PhoneAudioService.status();deliverShortcut()}
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, e: WebResourceError) {
                if (request.isForMainFrame) showConnect("Can't reach this PC. Keep the phone and PC on the same Wi-Fi, run start.bat on the PC, and allow Elleson Connect through Windows Firewall on the Private network. Check the IP and port shown in the host window.")
            }
        }
        if (savedInstanceState != null) {
            // Reconnect manually after process death; never resume a stale control session.
            showConnect("")
        }
        receiveSharedIntent(intent)
    }

    private fun selectConnectionMode(website:Boolean){
        connectionGeneration++
        findViewById<View>(R.id.localConnectionPanel).visibility=if(website)View.GONE else View.VISIBLE
        findViewById<View>(R.id.websiteConnectionPanel).visibility=if(website)View.VISIBLE else View.GONE
        for((id,selected)in listOf(R.id.modeLocal to !website,R.id.modeWebsite to website)){
            val button=findViewById<Button>(id);button.setBackgroundResource(if(selected)R.drawable.connect_background else R.drawable.field_background);button.setTextColor(android.graphics.Color.parseColor(if(selected)"#001522" else "#A5D5EA"));button.isSelected=selected
        }
        findViewById<Button>(R.id.connect).isEnabled=true;error.text=""
        getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putBoolean("websiteMode",website).apply()
        if(website)(getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(address.windowToken,0)
    }

    private fun localConnectionMessage(message:String,fromWeb:Boolean){
        if(fromWeb&&isAllowed(web.url?:"")){val value=JSONObject().put("state","error").put("message",message);web.evaluateJavascript("window.PCRLocalConnection?.nativeStatus($value)",null)}else error.text=message
    }

    private fun startLocalConnection(value:String,defaultPort:Int,fromWeb:Boolean=false){
        val target=TrustedOrigin.localTarget(value,defaultPort)
        if(target==null){localConnectionMessage("Enter four numbers separated by three dots, such as 192.168.8.100. The port must be between 1 and 65535.",fromWeb);return}
        val(ip,port)=target;val generation=++connectionGeneration
        findViewById<Button>(R.id.connect).isEnabled=false
        if(!fromWeb)error.text="Checking $ip on your local network…"
        Thread{
            var failure:String?=null;var connection:HttpURLConnection?=null
            try{
                val probe=java.net.URL("http://$ip:$port/api/ping").openConnection() as HttpURLConnection;connection=probe
                probe.connectTimeout=1800;probe.readTimeout=2200;probe.instanceFollowRedirects=false;probe.setRequestProperty("X-PCR","1");probe.setRequestProperty("Accept","application/json")
                val code=probe.responseCode
                if(code!=200)throw IllegalStateException(if(code==403)"The PC rejected local access. Restart the updated Windows host with local access enabled." else "This address did not respond as Elleson Connect (HTTP $code). Check the IP and port.")
                val output=java.io.ByteArrayOutputStream();probe.inputStream.use{input->val buffer=ByteArray(2048);while(true){val count=input.read(buffer);if(count<0)break;if(output.size()+count>16384)throw IllegalStateException("This address is not a Elleson Connect host.");output.write(buffer,0,count)}}
                val result=JSONObject(output.toString("UTF-8"));if(!result.optBoolean("ok")||!result.has("requirePassword")&&!result.has("requirePin"))throw IllegalStateException("This address is not a Elleson Connect host.")
            }catch(e:Exception){failure=if(e is IllegalStateException)e.message else "Can't reach $ip:$port. Use the same Wi-Fi, keep the PC host running, and allow Node/Elleson Connect on your Windows Private network."}finally{connection?.disconnect()}
            runOnUiThread{
                if(isFinishing||isDestroyed||generation!=connectionGeneration)return@runOnUiThread
                findViewById<Button>(R.id.connect).isEnabled=true
                val message=failure;if(message!=null){localConnectionMessage(message,fromWeb);return@runOnUiThread}
                address.setText(ip);portField.setText(port.toString());findViewById<Button>(R.id.portToggle).text="Port $port · Change"
                getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putString("ip",ip).putInt("port",port).putBoolean("websiteMode",false).apply()
                (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(address.windowToken,0)
                connectTo("http://$ip:$port")
            }
        }.start()
    }

    private fun connectTo(origin: String,suffix:String="") {
        connectionGeneration++
        DeviceCompanion.disconnect()
        selectedOrigin = TrustedOrigin.normalize(origin) ?: return
        getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putString("lastOrigin",selectedOrigin).apply()
        if (bridgeInstalled) WebViewCompat.removeWebMessageListener(web, "PCRAndroid")
        bridgeInstalled = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        if (bridgeInstalled) WebViewCompat.addWebMessageListener(web, "PCRAndroid", setOf(selectedOrigin!!)) { view, message, sourceOrigin, isMainFrame, reply ->
            if (!isMainFrame || TrustedOrigin.normalize(sourceOrigin.toString()) != selectedOrigin || !isAllowed(view.url ?: "")) return@addWebMessageListener
            try {
                val value = JSONObject(message.data ?: "{}")
                when (value.optString("type")) {
                    "transfer-ready" -> transferReady()
                    "app-update" -> {
                        val origin=selectedOrigin?:return@addWebMessageListener
                        val sha=value.optString("sha256");val size=value.optLong("size");val version=value.optString("version")
                        if(AppUpdatePolicy.valid(version,size,sha))startForegroundService(Intent(this,AppUpdateService::class.java).putExtra("origin",origin).putExtra("cookie",CookieManager.getInstance().getCookie(origin)).putExtra("sha256",sha).putExtra("size",size).putExtra("version",version))
                    }
                    "app-update-install" -> {selectedOrigin?.let{origin->AppUpdateService.ready(origin)?.let{file->startActivity(Intent(this,AppUpdateActivity::class.java).putExtra("file",file.absolutePath))}}}
                    "second-screen-preferences" -> {val side=value.optString("side");val orientation=value.optString("orientation");val quality=value.optString("quality");if(side in listOf("left","right","top","bottom")&&orientation in listOf("portrait","landscape")&&quality in listOf("auto","hd","smooth","low")){val saved=JSONObject().put("side",side).put("orientation",orientation).put("quality",quality).put("fast",value.optBoolean("fast",true));getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putString("secondScreenPreferences",saved.toString()).apply()}}
                    "second-screen-route" -> chooseFastLocalConnection()
                    "second-screen-route-cancel" -> {fastRouteGeneration++;fastLocalPending=false;nearby?.stop()}
                    "second-screen-orientation" -> {val active=value.optBoolean("active");requestedOrientation=if(!active)android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED else if(value.optString("orientation")=="portrait")android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;if(active)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)}
                    "phone-file-offer" -> {val origin=selectedOrigin?:return@addWebMessageListener;val offers=value.optJSONArray("offers")?:return@addWebMessageListener;if(offers.length() in 1..100)PhoneFileReceiver.offer(this,origin,CookieManager.getInstance().getCookie(origin).orEmpty(),offers){message->runOnUiThread{if(isAllowed(web.url?:"")){val detail=JSONObject().put("message",message);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:second-screen-files',{detail:$detail}))",null)}}}}
                    "transfer-pick" -> {
                        transferDestination=value.optString("destination").take(700)
                        try{startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),509)}catch(_:Exception){Toast.makeText(this,"Enable Android's Files app to choose documents.",Toast.LENGTH_LONG).show()}
                    }
                    "transfer-shared" -> { val items=org.json.JSONArray();sharedUris.forEach{items.put(JSONObject().put("direction","upload").put("uri",it.toString()).put("destination",value.optString("destination").take(700)))};if(items.length()>0){enqueueTransfers(items);sharedUris.clear();sharedText="";transferReady()} }
                    "transfer-control" -> {val origin=selectedOrigin?:return@addWebMessageListener;val command=value.optString("command");if(command in listOf("pause","resume","cancel","replace","keep-both"))startForegroundService(Intent(this,TransferService::class.java).setAction(TransferService.CONTROL).putExtra("origin",origin).putExtra("cookie",CookieManager.getInstance().getCookie(origin)).putExtra("id",value.optString("id")).putExtra("command",command))}
                    "transfer-file-action" -> {val origin=selectedOrigin?:return@addWebMessageListener;val command=value.optString("command");if(command in listOf("open","share")&&TransferService.completedDownload(this,origin,value.optString("id"))!=null)startActivity(Intent(this,TransferActionActivity::class.java).putExtra("origin",origin).putExtra("id",value.optString("id")).putExtra("command",command))}
                    "transfer-signout" -> {DeviceCompanion.disconnect();selectedOrigin?.let{TransferService.stopOrigin(this,it);FolderSync.disconnect(this,it)}}
                    "companion-connect" -> {val origin=selectedOrigin?:return@addWebMessageListener;DeviceCompanion.connect(this,origin,CookieManager.getInstance().getCookie(origin).orEmpty(),value.optString("account"),value.optString("deviceId"),value.optString("name"))}
                    "companion-disconnect" -> DeviceCompanion.disconnect()
                    "companion-context" -> DeviceCompanion.context(value.optString("page"),value.optBoolean("pcInput"))
                    "keyboard-settings" -> startActivity(Intent(this,za.co.pcremote.controller.keyboard.KeyboardSettingsActivity::class.java))
                    "phone-audio-start" -> {phoneAudioOutput=if(value.optString("output")=="virtual-mic")"virtual-mic" else "speakers";compressedPhoneAudio=value.optBoolean("compressed",true);requestPhoneAudio(value.optString("source"),value.optDouble("volume",.6))}
                    "phone-audio-stop" -> {pendingPhoneAudio=null;PhoneAudioService.stop()}
                    "phone-audio-control" -> PhoneAudioService.control(value.optDouble("volume",.6),value.optBoolean("muted",false))
                    "local-media-start" -> requestLocalMedia(value)
                    "local-media-stop" -> if(value.optString("id")==localMediaId)stopLocalMedia()
                    "local-media-credit" -> if(value.optString("id")==localMediaId)localMedia?.credit(value.optString("kind"))
                    "app-settings" -> startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))
                    "connect-local" -> startLocalConnection(value.optString("address"),value.optInt("port",7666),true)
                    "discover-local" -> nearby?.start()
                    "sync-clipboard-read" -> readSyncClipboard(value.optBoolean("force"))
                    "sync-clipboard-apply" -> applySyncClipboard(value.optString("text"))
                    "pin-widget" -> {val manager=android.appwidget.AppWidgetManager.getInstance(this);if(manager.isRequestPinAppWidgetSupported)manager.requestPinAppWidget(android.content.ComponentName(this,RemoteWidget::class.java),null,null)else Toast.makeText(this,"Long-press your home screen, open Widgets, and choose Elleson Connect.",Toast.LENGTH_LONG).show()}
                    "folder-sync-pc-change" -> {selectedOrigin?.let{origin->FolderSync.pairs(this).filter{it.optString("origin")==origin&&it.optBoolean("enabled")}.forEach{FolderSync.runNow(this,it.getString("id"))}}}
                    "folder-sync-host" -> {selectedOrigin?.let{FolderSync.connect(this,value.optString("hostId"),it,CookieManager.getInstance().getCookie(it).orEmpty())}}
                    "folder-sync-status" -> {selectedOrigin?.let{FolderSync.updateCookie(this,it,CookieManager.getInstance().getCookie(it).orEmpty())};folderSyncEvent()}
                    "folder-sync-add" -> {if(pendingSyncFolder==null){pendingSyncFolder=value;try{startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),511)}catch(_:Exception){pendingSyncFolder=null;Toast.makeText(this,"Enable Android Files to choose a sync folder.",Toast.LENGTH_LONG).show()}}}
                    "folder-sync-control" -> {val command=value.optString("command");if(command in listOf("pause","resume","remove","run"))FolderSync.control(this,value.optString("id"),command);folderSyncEvent()}
                    "haptic" -> { val now=SystemClock.elapsedRealtime();if(now-lastHaptic>=35){lastHaptic=now;web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)} }
                    "volume-keys" -> { volumeControlEnabled=value.optBoolean("enabled",false) }
                    "keyboard" -> showPhoneKeyboard()
                    "keyboard-hide" -> hidePhoneKeyboard()
                    "minimise" -> minimisePc(value.optInt("width",16),value.optInt("height",9))
                    "mini-window-state" -> {homeMiniReady=value.optBoolean("active");homeMiniWidth=value.optInt("width",16);homeMiniHeight=value.optInt("height",9);updateHomeMini()}
                    "remote-fullscreen" -> setRemoteFullscreen(value.optBoolean("enabled"))
                    "save-image" -> {
                        val encoded=value.optString("data")
                        if(downloadRequest==null&&encoded.length<=12*1024*1024){
                            val bytes=runCatching{android.util.Base64.decode(encoded,android.util.Base64.DEFAULT)}.getOrNull()
                            if(bytes!=null&&bytes.size>=8&&bytes.take(8)==listOf(137.toByte(),80.toByte(),78.toByte(),71.toByte(),13.toByte(),10.toByte(),26.toByte(),10.toByte())){
                                val name="Elleson-Connect-"+System.currentTimeMillis()+".png";screenshotBytes=bytes;downloadRequest=Pair("",name)
                                try{startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png").putExtra(Intent.EXTRA_TITLE,name),505)}catch(_:Exception){downloadRequest=null;screenshotBytes=null}
                            }
                        }
                    }
                    "save-recording" -> {
                        val encoded=value.optString("data");val mime=value.optString("mime")
                        if(downloadRequest==null&&encoded.length<=44*1024*1024&&mime in listOf("video/webm","video/mp4")){
                            val bytes=runCatching{android.util.Base64.decode(encoded,android.util.Base64.DEFAULT)}.getOrNull()
                            val webm=bytes!=null&&bytes.size>=4&&bytes.take(4)==listOf(26.toByte(),69.toByte(),223.toByte(),163.toByte())
                            val mp4=bytes!=null&&bytes.size>=12&&String(bytes,4,4,Charsets.US_ASCII)=="ftyp"
                            if(bytes!=null&&((mime=="video/webm"&&webm)||(mime=="video/mp4"&&mp4))){
                                val name="Elleson-Connect-"+System.currentTimeMillis()+if(mp4)".mp4"else".webm";screenshotBytes=bytes;downloadRequest=Pair("",name)
                                try{startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name),505)}catch(_:Exception){downloadRequest=null;screenshotBytes=null;Toast.makeText(this,"No file-saving app is available.",Toast.LENGTH_LONG).show()}
                            }
                        }
                    }
                    "open-link" -> {
                        val target=runCatching{URI(value.optString("url"))}.getOrNull()
                        if(target!=null&&target.scheme in listOf("http","https")&&target.host!=null&&target.userInfo==null){try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(target.toASCIIString())))}catch(_:Exception){Toast.makeText(this,"No browser is available.",Toast.LENGTH_SHORT).show()}}
                    }
                    "wake-config" -> {
                        val mac=value.optString("mac");if(runCatching{WakeOnLan.packet(mac)}.isSuccess){getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putString("wakeMac",mac).apply();findViewById<EditText>(R.id.wakeMac).setText(mac)}
                    }
                    "wake" -> {
                        val mac=getSharedPreferences("pc_remote_android",MODE_PRIVATE).getString("wakeMac","").orEmpty()
                        Thread{val message=try{WakeOnLan.send(mac);"Wake signal sent on your Wi-Fi. Wait a moment, then reconnect."}catch(e:Exception){e.message?:"Wake signal failed."};runOnUiThread{Toast.makeText(this,message,Toast.LENGTH_LONG).show()}}.start()
                    }
                    "start" -> {
                        if (pendingProjection) return@addWebMessageListener
                        val cookie = CookieManager.getInstance().getCookie(selectedOrigin!!).orEmpty()
                        if (!cookie.contains("pc_remote_session=")) { reply.postMessage("{\"type\":\"stopped\",\"message\":\"Sign in first to share your phone.\"}"); return@addWebMessageListener }
                        shareReply = reply; pendingProjection = true
                        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 501)
                        else requestProjection()
                    }
                    "stop" -> { pendingProjection = false; ScreenShareService.stopSharing() }
                    "mark" -> ScreenShareService.forwardMark(value)
                    "control-stop" -> ScreenShareService.stopPhoneControl()
                    "phone-receive-folder" -> {externalActivity=true;startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),512)}
                }
            } catch (_: Exception) { reply.postMessage("{\"type\":\"stopped\",\"message\":\"Could not start phone sharing.\"}") }
        }
        error.text = ""; connectScreen.visibility = View.GONE; web.visibility = View.VISIBLE; web.requestFocus(); web.loadUrl("$selectedOrigin/$suffix")
    }

    private fun chooseFastLocalConnection(){
        if(fastLocalPending)return
        val origin=selectedOrigin?:return;val serial=connectionGeneration;val routeSerial=++fastRouteGeneration
        fastLocalPending=true;nearby?.start()
        web.postDelayed({
            val candidates=nearbyTargets.toList();val cookie=CookieManager.getInstance().getCookie(origin).orEmpty()
            Thread{
                val result=runCatching{FastLocalConnection.choose(origin,cookie,candidates)}.getOrDefault(FastLocalConnection.Result(origin,null,0))
                runOnUiThread{
                    if(routeSerial!=fastRouteGeneration)return@runOnUiThread
                    fastLocalPending=false;nearby?.stop()
                    if(isFinishing||isDestroyed||!appForeground||serial!=connectionGeneration||origin!=selectedOrigin)return@runOnUiThread
                    if(result.origin!=origin&&result.cookie!=null){CookieManager.getInstance().setCookie(result.origin,result.cookie){accepted->if(accepted&&appForeground&&serial==connectionGeneration){CookieManager.getInstance().flush();connectTo(result.origin,"#second-screen")}}}
                    else{val detail=JSONObject().put("state","ready").put("local",origin.startsWith("http://")).put("milliseconds",result.milliseconds);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:local-route',{detail:$detail}))",null)}
                }
            }.start()
        },1200)
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
        if(requestCode==507){val source=pendingPhoneAudio;if(source!=null){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)continuePhoneAudio(source)else{pendingPhoneAudio=null;phoneAudioEvent("error","Microphone permission was declined. Allow it in Android app settings.")}}}
        if(requestCode==506){val value=pendingLocalMedia;pendingLocalMedia=null;if(value!=null&&isAllowed(web.url?:"")){if(localMediaPermissions(value).all{checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED})beginLocalMedia(value)else mediaEvent(JSONObject().put("kind","error").put("id",value.optString("id")).put("message","Camera or microphone permission was declined. Open Android app permissions to allow access."))}}
        if(requestCode==503){val request=microphoneRequest;microphoneRequest=null;if(request!=null){val required=mediaPermissions(request);if(required!=null&&required.all{checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED}&&isAllowed(web.url?:""))grantWebMedia(request) else request.deny()}}
    }
    @Deprecated("MediaProjection consent result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if(requestCode==512){
            val folder=data?.data
            if(resultCode==RESULT_OK&&folder?.scheme=="content"&&isAllowed(web.url?:""))runCatching{contentResolver.takePersistableUriPermission(folder,(data?.flags?:0) and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION));getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putString("phoneDropFolder",folder.toString()).apply();Toast.makeText(this,"Incoming files will save to this folder with their original names.",Toast.LENGTH_LONG).show()}
            return
        }
        if(requestCode==511){finishSyncFolder(resultCode,data);return}
        if(requestCode==508){val source=pendingPhoneAudio;pendingPhoneAudio=null;if(source=="playback"&&resultCode==RESULT_OK&&data!=null&&isAllowed(web.url?:""))startPhoneAudio(source,data,resultCode)else phoneAudioEvent("stopped","Android audio sharing was cancelled.");return}
        if(requestCode==509){
            if(resultCode==RESULT_OK&&isAllowed(web.url?:"")){
                val uris=mutableListOf<Uri>();data?.data?.let{uris.add(it)};data?.clipData?.let{clip->for(i in 0 until clip.itemCount.coerceAtMost(200))uris.add(clip.getItemAt(i).uri)}
                val items=org.json.JSONArray();for(uri in uris.distinct().filter{it.scheme=="content"}.take(200)){runCatching{contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION)};items.put(JSONObject().put("direction","upload").put("uri",uri.toString()).put("destination",transferDestination))};enqueueTransfers(items)
            };return
        }
        if(requestCode==505){
            val request=downloadRequest;downloadRequest=null;val destination=data?.data;val image=screenshotBytes;screenshotBytes=null
            if(resultCode==RESULT_OK&&request!=null&&destination!=null&&image!=null){Thread{val message=try{contentResolver.openOutputStream(destination,"w")?.use{it.write(image)}?:throw IllegalStateException("Could not save screenshot.");"Screenshot saved."}catch(e:Exception){e.message?:"Could not save screenshot."};runOnUiThread{Toast.makeText(this,message,Toast.LENGTH_LONG).show()}}.start();return}
            if(resultCode==RESULT_OK&&request!=null&&destination!=null&&isAllowed(request.first)){
                runCatching{contentResolver.takePersistableUriPermission(destination,Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)}
                val uri=Uri.parse(request.first);enqueueTransfers(org.json.JSONArray().put(JSONObject().put("direction","download").put("uri",destination.toString()).put("name",request.second).put("path",uri.encodedPath+"?"+uri.encodedQuery.orEmpty())))
            };return
        }
        if(requestCode==504){
            val callback=filesResult;filesResult=null
            val selected=if(resultCode==RESULT_OK&&isAllowed(web.url?:""))WebChromeClient.FileChooserParams.parseResult(resultCode,data)?.filter{it.scheme=="content"}?.distinct()?.take(2000)?.toTypedArray()else null
            callback?.onReceiveValue(selected?.takeIf{it.isNotEmpty()});return
        }
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
    private fun grantWebMedia(request:PermissionRequest){
        if(!isAllowed(web.url?:"")){request.deny();return}
        if(PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources){request.grant(request.resources);return}
        microphoneRequest?.takeIf{it!==request}?.deny();microphoneRequest=request;stopLocalMedia()
        PhoneAudioService.stopThen{ready->if(microphoneRequest===request){microphoneRequest=null;if(ready&&isAllowed(web.url?:"")&&!isFinishing)request.grant(request.resources)else request.deny()}}
    }

    private fun showConnect(message: String) {
        hideFullscreen()
        homeMiniReady=false;updateHomeMini(false);setRemoteFullscreen(false)
        volumeControlEnabled=false;
        pendingProjection = false; ScreenShareService.stopSharing()
        web.stopLoading()
        web.loadUrl("about:blank")
        web.visibility = View.GONE
        connectScreen.visibility = View.VISIBLE
        error.text = message
    }

    @Deprecated("Android navigation compatibility")
    override fun onBackPressed() {
        if(fullscreenView!=null){hideFullscreen();return}
        if(remoteFullscreenActive){setRemoteFullscreen(false);web.evaluateJavascript("window.PCRScreenTools?.restoreControls()",null);return}
        if (web.visibility != View.VISIBLE) {
            super.onBackPressed()
            return
        }
        // Follow the same page stack as the browser before leaving the connection.
        web.evaluateJavascript("window.PCRPages ? (window.PCRPages.back() ? 'closed' : 'home') : (typeof rs!=='undefined' && rs.on ? (rsClose(), 'closed') : 'home')") { result ->
            if (result == "\"home\"") showConnect("")
        }
    }

    private fun hidePhoneKeyboard(){
        keyboardGeneration++
        phoneKeyboardRequested=false
        applySystemBars()
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(web.windowToken,0)
    }

    private fun showPhoneKeyboard(){
        val generation=++keyboardGeneration
        phoneKeyboardRequested=true
        applySystemBars()
        web.requestFocus()
        var attempts=0
        fun show(){
            if(generation!=keyboardGeneration||isFinishing||isDestroyed||isInPictureInPictureMode||!isAllowed(web.url?:""))return
            web.evaluateJavascript("!!(document.activeElement?.id==='typeText'&&!document.activeElement.readOnly)"){focused->
                if(focused!="true"||generation!=keyboardGeneration||!web.hasWindowFocus())return@evaluateJavascript
                if(Build.VERSION.SDK_INT>=30&&web.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime())==true)return@evaluateJavascript
                val manager=getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                // DOM focus and WebView's editor connection update on separate
                // frames after the Windows field reply. Refresh that connection
                // before asking Android to show the IME.
                if(attempts++<2)manager.restartInput(web)
                manager.showSoftInput(web,InputMethodManager.SHOW_IMPLICIT)
                if(Build.VERSION.SDK_INT>=30)window.insetsController?.show(android.view.WindowInsets.Type.ime())
            }
        }
        for(delay in longArrayOf(0,80,220,450,800,1400))web.postDelayed({show()},delay)
    }

    private fun miniParams(width:Int,height:Int,auto:Boolean):android.app.PictureInPictureParams{
        val ratio=(width.toDouble().coerceAtLeast(1.0)/height.coerceAtLeast(1)).coerceIn(0.42,2.38)
        val builder=android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational((ratio*1000).toInt(),1000))
        if(Build.VERSION.SDK_INT>=31)builder.setAutoEnterEnabled(auto)
        return builder.build()
    }
    private fun canHomeMini()=homeMiniReady&&!externalActivity&&web.visibility==View.VISIBLE&&isAllowed(web.url?:"")&&!isFinishing&&filesResult==null&&downloadRequest==null&&pendingSyncFolder==null&&!pendingProjection
    private fun updateHomeMini(enabled:Boolean=canHomeMini()){
        if(Build.VERSION.SDK_INT>=31&&packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE))runCatching{setPictureInPictureParams(miniParams(homeMiniWidth,homeMiniHeight,enabled))}
    }
    override fun onUserLeaveHint(){
        super.onUserLeaveHint()
        if(!canHomeMini()){updateHomeMini(false);return}
        web.evaluateJavascript("window.PCRMiniWindow?.prepare()",null)
        if(Build.VERSION.SDK_INT<31)minimisePc(homeMiniWidth,homeMiniHeight,false)
    }
    override fun startActivityForResult(intent:Intent,requestCode:Int,options:Bundle?){externalActivity=true;updateHomeMini(false);super.startActivityForResult(intent,requestCode,options)}
    override fun startActivity(intent:Intent,options:Bundle?){externalActivity=true;updateHomeMini(false);super.startActivity(intent,options)}
    private fun setRemoteFullscreen(enabled:Boolean){
        remoteFullscreenActive=enabled
        applySystemBars()
    }
    private fun applySystemBars(){
        // Keep Back/Home/Recents available for both our IME and other keyboards.
        // Restore immersive viewing only after the keyboard has actually closed.
        val immersive=KeyboardNavigation.immersive(remoteFullscreenActive||fullscreenView!=null,phoneKeyboardRequested,phoneKeyboardVisible)
        if(Build.VERSION.SDK_INT>=30){
            window.insetsController?.let { controller ->
                controller.systemBarsBehavior=if(immersive)android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE else android.view.WindowInsetsController.BEHAVIOR_DEFAULT
                if(immersive)controller.hide(android.view.WindowInsets.Type.systemBars())else controller.show(android.view.WindowInsets.Type.systemBars())
            }
        }else{
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility=if(immersive)View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY else View.SYSTEM_UI_FLAG_VISIBLE
        }
        if(immersive)window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)else window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
    }
    private fun minimisePc(width:Int,height:Int,notifyFailure:Boolean=true){
        if(!isAllowed(web.url?:""))return
        hidePhoneKeyboard()
        var entered=false
        if(packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)){
            entered=runCatching{enterPictureInPictureMode(miniParams(width,height,canHomeMini()))}.getOrDefault(false)
        }
        if(!entered)miniWindowEvent(false,if(notifyFailure)"Allow Picture-in-picture for Elleson Connect in Android app settings, then try again."else"")
    }

    private fun miniWindowEvent(active:Boolean,message:String=""){
        if(isAllowed(web.url?:"")){val value=JSONObject().put("active",active).put("message",message);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:mini-window',{detail:$value}))",null)}
    }

    override fun onPictureInPictureModeChanged(active:Boolean,newConfig:android.content.res.Configuration){
        super.onPictureInPictureModeChanged(active,newConfig)
        miniWindowEvent(active)
    }

    override fun onDestroy() {
        FolderSync.events=null
        (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).removePrimaryClipChangedListener(clipboardListener)
        nearby?.stop()
        connectionGeneration++
        pendingPhoneAudio=null;PhoneAudioService.stop();PhoneAudioService.events=null
        TransferService.events=null
        AppUpdateService.events=null
        stopLocalMedia()
        hideFullscreen()
        volumeControlEnabled=false
        microphoneRequest?.deny();microphoneRequest=null;filesResult?.onReceiveValue(null);filesResult=null
        controlDialog?.dismiss();controlDialog=null
        pendingProjection = false; ScreenShareService.stopSharing(); ScreenShareService.events = null; shareReply = null
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        appForeground=true
        DeviceCompanion.foreground(this,true)
        companionObserver?.invoke()
        companionObserver=DeviceCompanion.observe{if(isAllowed(web.url?:"")){val value=JSONObject().put("state",DeviceCompanion.state).put("connected",DeviceCompanion.connected);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:companion-state',{detail:$value}))",null)}}
        ScreenShareService.previewEnabled = true
    }

    override fun onStop() {
        appForeground=false
        fastRouteGeneration++;fastLocalPending=false
        DeviceCompanion.foreground(this,false)
        companionObserver?.invoke();companionObserver=null
        hidePhoneKeyboard()
        nearby?.stop()
        stopLocalMedia()

        if(isAllowed(web.url?:""))web.evaluateJavascript("window.PCRCamera?.stop()",null)
        // Only the in-app thumbnail pauses. The foreground service owns both
        // capture and the network connection while the user opens other apps.
        ScreenShareService.previewEnabled = false
        super.onStop()
    }

    private fun phoneAudioEvent(state:String,message:String){val value=JSONObject().put("state",state).put("message",message);if(isAllowed(web.url?:""))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:phone-audio',{detail:$value}))",null)}
    private fun enqueueTransfers(items:org.json.JSONArray){
        val origin=selectedOrigin?:return;if(items.length()==0||!isAllowed(web.url?:""))return
        val cookie=CookieManager.getInstance().getCookie(origin).orEmpty();if(!cookie.contains("pc_remote_session="))return
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),510)
        try{startForegroundService(Intent(this,TransferService::class.java).setAction(TransferService.ADD).putExtra("origin",origin).putExtra("cookie",cookie).putExtra("items",items.toString()))}catch(_:Exception){Toast.makeText(this,"Open Elleson Connect and retry the transfer.",Toast.LENGTH_LONG).show()}
    }
    private fun transferReady(){
        val origin=selectedOrigin?:return;if(!isAllowed(web.url?:""))return
        val queue=TransferService.snapshot(this,origin);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:transfer-queue',{detail:$queue}))",null)
        val share=JSONObject().put("count",sharedUris.size).put("text",sharedText).put("open",openFilesOnReady||sharedUris.isNotEmpty()||sharedText.isNotBlank());openFilesOnReady=false
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:share-inbox',{detail:$share}))",null)
    }
    @Suppress("DEPRECATION")
    private fun receiveSharedIntent(value:Intent?){
        shortcutIntent(value)
        if(value==null)return
        if(value.action in listOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE)){
            sharedUris.clear();sharedText=value.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.take(250000).orEmpty()
            if(value.action==Intent.ACTION_SEND)value.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let{sharedUris.add(it)}
            else value.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let{sharedUris.addAll(it)}
            value.clipData?.let{clip->for(i in 0 until clip.itemCount.coerceAtMost(200))clip.getItemAt(i).uri?.let{sharedUris.add(it)}}
            val unique=sharedUris.distinct().filter{it.scheme=="content"}.take(200);sharedUris.clear();sharedUris.addAll(unique);openFilesOnReady=true
        }else if(value.getBooleanExtra("openFiles",false))openFilesOnReady=true else return
        if(web.visibility==View.VISIBLE&&isAllowed(web.url?:""))transferReady()
        else getSharedPreferences("pc_remote_android",MODE_PRIVATE).getString("lastOrigin",null)?.let{TrustedOrigin.normalize(it)}?.let{connectTo(it)}
    }
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);receiveSharedIntent(intent)}
    private fun requestPhoneAudio(source:String,volume:Double){
        if(source !in listOf("microphone","playback")||!isAllowed(web.url?:""))return
        if(source=="playback"&&Build.VERSION.SDK_INT<29){phoneAudioEvent("error","Phone audio sharing needs Android 10 or newer.");return}
        if(pendingPhoneAudio!=null)return
        stopLocalMedia();PhoneAudioService.stop();pendingPhoneAudio=source;pendingPhoneAudioVolume=if(volume.isFinite())volume.coerceIn(0.0,1.0)else .6
        web.evaluateJavascript("window.PCRMedia?.stop()",null)
        PhoneAudioService.stopThen{ready->if(pendingPhoneAudio==source){if(!ready){pendingPhoneAudio=null;phoneAudioEvent("error","The previous audio session is still stopping. Try again.")}else if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),507)else continuePhoneAudio(source)}}
    }
    private fun continuePhoneAudio(source:String){
        if(!isAllowed(web.url?:"")){pendingPhoneAudio=null;return}
        if(source=="playback"){
            val manager=getSystemService(MediaProjectionManager::class.java)
            val consent=if(Build.VERSION.SDK_INT>=34)manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())else manager.createScreenCaptureIntent()
            startActivityForResult(consent,508)
        }else{pendingPhoneAudio=null;startPhoneAudio(source)}
    }
    private fun startPhoneAudio(source:String,consent:Intent?=null,code:Int=0){
        val origin=selectedOrigin?:return
        val cookie=CookieManager.getInstance().getCookie(origin).orEmpty()
        if(!cookie.contains("pc_remote_session=")){phoneAudioEvent("error","Sign in and pair the PC first.");return}
        try{startForegroundService(Intent(this,PhoneAudioService::class.java).putExtra("origin",origin).putExtra("cookie",cookie).putExtra("source",source).putExtra("volume",pendingPhoneAudioVolume).putExtra("compressed",compressedPhoneAudio).putExtra("output",phoneAudioOutput).putExtra("consent",consent).putExtra("resultCode",code))}catch(_:Exception){phoneAudioEvent("error","Android could not start audio streaming. Open this app and retry.")}
    }
    private fun mediaEvent(value:JSONObject){runOnUiThread{if(!isFinishing&&!isDestroyed&&isAllowed(web.url?:""))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:native-media',{detail:$value}))",null)}}
    private fun localMediaPermissions(value:JSONObject)=listOfNotNull(if(value.optBoolean("video"))Manifest.permission.CAMERA else null,if(value.optBoolean("audio"))Manifest.permission.RECORD_AUDIO else null)
    private fun requestLocalMedia(value:JSONObject){
        if(!isAllowed(web.url?:"")||value.optString("id").length !in 1..80)return
        stopLocalMedia();localMediaId=value.optString("id");val required=localMediaPermissions(value);if(required.isEmpty())return
        val missing=required.filter{checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED}
        PhoneAudioService.stopThen{ready->if(localMediaId==value.optString("id")&&isAllowed(web.url?:"")){if(!ready)mediaEvent(JSONObject().put("kind","error").put("id",localMediaId).put("message","The previous audio session is still stopping. Retry in a moment."))else if(missing.isEmpty())beginLocalMedia(value)else{pendingLocalMedia=value;requestPermissions(missing.toTypedArray(),506)}}}
    }
    @Suppress("DEPRECATION")
    private fun beginLocalMedia(value:JSONObject){
        val id=value.optString("id");localMediaId=id
        val degrees=when(windowManager.defaultDisplay.rotation){android.view.Surface.ROTATION_90->90;android.view.Surface.ROTATION_180->180;android.view.Surface.ROTATION_270->270;else->0}
        localMedia=LocalMediaCapture{event->mediaEvent(event.put("id",id))}.also{it.start(value.optBoolean("video"),value.optBoolean("audio"),value.optBoolean("front"),degrees)}
    }
    private fun stopLocalMedia(){pendingLocalMedia=null;localMedia?.close();localMedia=null;localMediaId=""}
    private fun showControlRequest() {
        val id=ScreenShareService.pendingControl()?:return
        if(!hasWindowFocus() || isFinishing || controlDialog?.isShowing==true)return
        val enabled=PhoneControlService.instance!=null
        controlDialog=AlertDialog.Builder(this).setTitle("Allow Elleson Connect to control this phone?")
            .setMessage(if(enabled)"Allow PC mouse control, clicks, scrolling, Back, Home and replacing text in selected fields for this session (up to 10 minutes). Stop control anytime from the sharing notification." else "Enable Elleson Connect phone control in Android Accessibility settings, then return here and approve this request. This lets your PC mouse control other apps on your phone.")
            .setNegativeButton("Decline"){_,_->ScreenShareService.respondControl(id,false);controlDialog=null}
            .setPositiveButton(if(enabled)"Allow control" else "Open settings"){_,_->
                controlDialog=null
                if(enabled)ScreenShareService.respondControl(id,true) else startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }.setOnCancelListener{ScreenShareService.respondControl(id,false);controlDialog=null}.create()
        controlDialog?.show()
    }
    override fun onResume() { super.onResume();externalActivity=false;if(!isInPictureInPictureMode){miniWindowEvent(false);if(remoteFullscreenActive)setRemoteFullscreen(true);web.postDelayed({showControlRequest()},400)};updateHomeMini();if(connectScreen.visibility==View.VISIBLE)nearby?.start() }

    private fun nearbyEvent(value:JSONObject){
        if(isFinishing||isDestroyed)return
        if(isAllowed(web.url?:""))web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:nearby',{detail:$value}))",null)
        val list=findViewById<android.widget.LinearLayout>(R.id.nearbyHosts)
        when(value.optString("state")){
            "searching"->{list.removeAllViews();findViewById<Button>(R.id.nearbyScan).text="Searching nearby…"}
            "finished","error"->findViewById<Button>(R.id.nearbyScan).text="Find my PC nearby"
            "found"->{val ip=value.optString("address");val port=value.optInt("port",7666);if(list.findViewWithTag<View>(ip)!=null)return;val button=Button(this);button.tag=ip;button.text=value.optString("name","Your PC")+" · "+ip;button.isAllCaps=false;button.setOnClickListener{nearby?.stop();startLocalConnection(ip,port,web.visibility==View.VISIBLE)};list.addView(button)}
        }
    }
    private fun clipboardHash(text:String)=java.security.MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    private fun readSyncClipboard(force:Boolean){
        if(!isAllowed(web.url?:"")||!window.decorView.hasWindowFocus())return
        val value=JSONObject().put("unchanged",true)
        if(clipboardDirty||force){clipboardDirty=false;val text=(getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).primaryClip?.takeIf{it.itemCount>0}?.getItemAt(0)?.text?.toString();if(text!=null&&text.length<=250000){val prefs=getSharedPreferences("pc_remote_android",MODE_PRIVATE);val key="clip_"+clipboardHash(selectedOrigin.orEmpty());val previous=prefs.getString(key,null);val hash=clipboardHash(text);prefs.edit().putString(key,hash).apply();if(force||previous!=null&&previous!=hash)value.put("text",text).put("unchanged",false)}}
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:local-clipboard',{detail:$value}))",null)
    }
    private fun applySyncClipboard(text:String){
        if(!isAllowed(web.url?:"")||text.length>250000||!window.decorView.hasWindowFocus())return
        (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("Elleson Connect",text));clipboardDirty=false
        getSharedPreferences("pc_remote_android",MODE_PRIVATE).edit().putString("clip_"+clipboardHash(selectedOrigin.orEmpty()),clipboardHash(text)).apply()
    }
    private fun shortcutIntent(value:Intent?){
        val action=value?.getStringExtra("quick_action").orEmpty();if(action !in listOf("screen","files","keyboard","audio"))return
        pendingShortcut=action
        if(isAllowed(web.url?:""))deliverShortcut()else getSharedPreferences("pc_remote_android",MODE_PRIVATE).getString("lastOrigin",null)?.let{if(TrustedOrigin.normalize(it)!=null)connectTo(it)}
    }
    private fun deliverShortcut(){if(pendingShortcut.isEmpty()||!isAllowed(web.url?:""))return;val value=JSONObject().put("action",pendingShortcut);pendingShortcut="";web.evaluateJavascript("window.PCRPendingShortcut=$value;window.dispatchEvent(new Event('pcr:shortcut'))",null)}
    private fun folderSyncEvent(){if(!isAllowed(web.url?:""))return;val value=FolderSync.snapshot(this);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pcr:folder-sync',{detail:$value}))",null)}
    private fun finishSyncFolder(resultCode:Int,data:Intent?){
        val config=pendingSyncFolder;pendingSyncFolder=null;val uri=data?.data;val origin=selectedOrigin;if(resultCode!=RESULT_OK||uri==null||origin==null||config==null||!isAllowed(web.url?:""))return
        try{val flags=data.flags and(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION);contentResolver.takePersistableUriPermission(uri,flags);if(config.optString("direction")!="upload"&&(flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION)==0)throw IllegalStateException("Choose a writable phone folder for two-way sync.");var name="Phone folder";contentResolver.query(android.provider.DocumentsContract.buildDocumentUriUsingTree(uri,android.provider.DocumentsContract.getTreeDocumentId(uri)),arrayOf(android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME),null,null,null)?.use{c->if(c.moveToFirst())name=c.getString(0)};FolderSync.add(this,uri,name,origin,CookieManager.getInstance().getCookie(origin).orEmpty(),config.optString("destination").take(800),config.optString("direction"));folderSyncEvent()}catch(e:Exception){Toast.makeText(this,e.message?:"Folder access could not be saved. Choose it again.",Toast.LENGTH_LONG).show()}
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus);DeviceCompanion.foreground(this,hasFocus);if(hasFocus)clipboardDirty=true;if(hasFocus)web.post{showControlRequest()} }

    override fun onKeyDown(keyCode: Int,event: KeyEvent): Boolean {
        if(volumeControlEnabled&&web.visibility==View.VISIBLE&&isAllowed(web.url?:"")&&keyCode in listOf(KeyEvent.KEYCODE_VOLUME_UP,KeyEvent.KEYCODE_VOLUME_DOWN)){
            val action=if(keyCode==KeyEvent.KEYCODE_VOLUME_UP)"volup" else "voldown"
            web.evaluateJavascript("window.PCRDeviceInput?.volume('$action')",null);return true
        }
        return super.onKeyDown(keyCode,event)
    }
    override fun onKeyUp(keyCode: Int,event: KeyEvent): Boolean {
        if(volumeControlEnabled&&keyCode in listOf(KeyEvent.KEYCODE_VOLUME_UP,KeyEvent.KEYCODE_VOLUME_DOWN))return true
        return super.onKeyUp(keyCode,event)
    }

    private fun mediaPermissions(request:PermissionRequest):List<String>?{
        if(!isAllowed(request.origin.toString())||request.resources.isEmpty())return null
        val permissions=mutableListOf<String>()
        for(resource in request.resources)when(resource){
            PermissionRequest.RESOURCE_AUDIO_CAPTURE->permissions.add(Manifest.permission.RECORD_AUDIO)
            PermissionRequest.RESOURCE_VIDEO_CAPTURE->permissions.add(Manifest.permission.CAMERA)
            else->return null
        }
        return permissions.distinct()
    }
    private fun hideFullscreen(){
        fullscreenView?.let{(it.parent as? ViewGroup)?.removeView(it)};fullscreenView=null
        val callback=fullscreenCallback;fullscreenCallback=null;callback?.onCustomViewHidden()
        applySystemBars()
        if(selectedOrigin!=null)web.visibility=View.VISIBLE
    }

}
