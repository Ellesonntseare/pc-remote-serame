package za.co.pcremote.controller
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
object WakeOnLan {
    fun packet(mac: String): ByteArray {
        require(Regex("^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$").matches(mac)) { "Enter a valid MAC address." }
        val target=mac.replace(":","").replace("-","").chunked(2).map{it.toInt(16).toByte()}.toByteArray()
        require(target.any{it.toInt()!=0} && (target[0].toInt() and 1) == 0) { "Choose a device network adapter MAC address." }
        return ByteArray(102){if(it<6)255.toByte() else target[(it-6)%6]}
    }
    fun send(mac: String) { val bytes=packet(mac);DatagramSocket().use{it.broadcast=true;it.send(DatagramPacket(bytes,bytes.size,InetAddress.getByName("255.255.255.255"),9))} }
}
