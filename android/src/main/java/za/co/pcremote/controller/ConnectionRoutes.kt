package za.co.pcremote.controller

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom

internal object ConnectionRoutes {
    private val random = SecureRandom()
    data class Ping(val reachable: Boolean, val paired: Boolean = false, val owner: Boolean = false, val code: Int = 0)
    data class Host(val key: String, val local: List<String>, val website: String?, val expiresAt: Long, val checkedAt: Long)
    data class Switch(val origin: String, val cookie: String)

    private fun get(origin: String, path: String, cookie: String? = null): Pair<Int, JSONObject?> {
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = 1500
            connection.readTimeout = 1800
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-PCR", "1")
            if (cookie != null) connection.setRequestProperty("Cookie", cookie)
            val code = connection.responseCode
            if (code != 200) return code to null
            val bytes = java.io.ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(2048)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (bytes.size() + count > 16384) return code to null
                    bytes.write(buffer, 0, count)
                }
            }
            code to JSONObject(bytes.toString("UTF-8"))
        } finally { connection.disconnect() }
    }

    fun ping(origin: String?, cookie: String? = null): Ping {
        if (origin == null || TrustedOrigin.normalize(origin) != origin) return Ping(false)
        return runCatching {
            val (code, body) = get(origin, "/api/ping", cookie)
            val reachable = body?.optBoolean("ok") == true && (body.has("requirePassword") || body.has("requirePin"))
            Ping(reachable, body?.optBoolean("paired") == true, body?.optString("role") == "owner", code)
        }.getOrDefault(Ping(false))
    }

    fun bind(origin: String, cookie: String): Host? = runCatching {
        val (_, value) = get(origin, "/api/local-route-key", cookie)
        val body = value ?: return null
        val key = body.getString("publicKey")
        val expires = if (body.optBoolean("persistent")) body.optLong("expiresAt") else 0L
        val addresses = body.optJSONArray("localOrigins")
        val local = (0 until (addresses?.length() ?: 0)).mapNotNull {
            TrustedOrigin.normalize(addresses!!.optString(it))?.takeIf { candidate -> candidate.startsWith("http://") }
        }.distinct().take(12)
        val website = TrustedOrigin.normalize(body.optString("website"))?.takeIf { it.startsWith("https://") }
        Host(key, local, website, expires, System.currentTimeMillis())
    }.getOrNull()

    fun verify(host: Host, target: String): Boolean = runCatching {
        if (target != host.website && target !in host.local) return false
        val nonce = ByteArray(32).also(random::nextBytes).joinToString("") { "%02x".format(it) }
        val (_, value) = get(target, "/api/route-proof?nonce=$nonce")
        val body = value ?: return false
        body.optString("origin") == target && body.optString("nonce") == nonce &&
            LocalRouteProof.verify(host.key, nonce, target, body.optString("signature"))
    }.getOrDefault(false)

    fun authorize(host: Host, target: String, originalCookie: String): Switch? {
        val remaining = (host.expiresAt - System.currentTimeMillis()) / 1000
        if (remaining <= 0 || !verify(host, target)) return null
        val session = originalCookie.split(';').map(String::trim).firstOrNull { it.matches(Regex("pc_remote_session=[a-f0-9]{64}")) } ?: return null
        val ping = ping(target, session)
        if (!ping.reachable || !ping.paired || !ping.owner) return null
        val attributes = "; Path=/; HttpOnly; SameSite=Strict; Max-Age=$remaining" + if (target.startsWith("https://")) "; Secure" else ""
        return Switch(target, session + attributes)
    }

    fun advice(origin: String?, ping: Ping, local: Boolean): String {
        if (origin == null) return if (local) "No PC address saved. Enter the address shown by the Windows host." else "No website configured for this PC."
        if (ping.reachable) return "Reachable"
        if (ping.code in listOf(502, 503, 504, 530)) return "Website cannot reach the PC. Start the Windows host and check its tunnel."
        return if (local) "Unreachable. Use the same network and check Windows Firewall." else "Unreachable. Check internet access and the PC’s website tunnel."
    }
}
