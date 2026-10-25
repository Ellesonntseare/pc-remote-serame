package za.co.pcremote.controller
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.Inet4Address
import java.net.NetworkInterface
object WakeOnLan {
    fun packet(mac: String): ByteArray {
        require(Regex("^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$").matches(mac)) { "Enter a valid MAC address." }
        val target=mac.replace(":","").replace("-","").chunked(2).map{it.toInt(16).toByte()}.toByteArray()
        require(target.any{it.toInt()!=0} && (target[0].toInt() and 1) == 0) { "Choose a device network adapter MAC address." }
        return ByteArray(102){if(it<6)255.toByte() else target[(it-6)%6]}
    }
    fun send(mac: String) {
        val bytes=packet(mac)
        val targets=linkedSetOf(InetAddress.getByName("255.255.255.255"))
        // Directed Wi-Fi broadcasts also reach routers that drop limited broadcasts.
        runCatching { NetworkInterface.getNetworkInterfaces()?.asSequence()?.filter{it.isUp&&!it.isLoopback}?.forEach{network->network.interfaceAddresses.forEach{address->if(address.address is Inet4Address&&address.broadcast!=null)targets.add(address.broadcast)}} }
        var sent=false
        DatagramSocket().use{socket->
            socket.broadcast=true
            repeat(3){for(target in targets.take(8))for(port in listOf(9,7))runCatching{socket.send(DatagramPacket(bytes,bytes.size,target,port));sent=true}}
        }
        check(sent){"Could not send a wake signal. Connect to the PC's Wi-Fi and try again."}
    }
}
