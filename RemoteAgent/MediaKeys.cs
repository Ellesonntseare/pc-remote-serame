using System.Runtime.InteropServices;
using System.Text.Json;
using NAudio.CoreAudioApi;

internal static class MediaKeys
{
    public static void Run()
    {
        try
        {
            using var reader = new StreamReader(Console.OpenStandardInput());
            var buffer = new char[257];
            int length = reader.ReadBlock(buffer, 0, buffer.Length);
            if (length > 256) throw new ArgumentException("Invalid media command.");
            using var request = JsonDocument.Parse(new string(buffer, 0, length));
            string? action = request.RootElement.GetProperty("action").GetString();
            if (action is "volup" or "voldown" or "mute")
            {
                using var enumerator = new MMDeviceEnumerator();
                using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                var volume = device.AudioEndpointVolume;
                if (action == "mute") volume.Mute = !volume.Mute;
                else
                {
                    int current = (int)Math.Round(volume.MasterVolumeLevelScalar * 100);
                    volume.MasterVolumeLevelScalar = Math.Clamp(current + (action == "volup" ? 1 : -1), 0, 100) / 100f;
                    volume.Mute = false;
                }
                int percent = (int)Math.Round(volume.MasterVolumeLevelScalar * 100);
                bool muted = volume.Mute;
                Console.WriteLine(JsonSerializer.Serialize(new { ok = true, volume = percent, muted, msg = action == "mute" ? muted ? "Sound muted" : "Sound on" : $"Volume {percent}%" }));
                return;
            }
            ushort code = action switch
            {
                "next" => 0xB0, "prev" => 0xB1, "playpause" => 0xB3,
                _ => throw new ArgumentException("Invalid media command.")
            };
            int count = 1;
            var inputs = new Native.INPUT[count * 2];
            for (int i = 0; i < count; i++)
            {
                inputs[i * 2] = new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = new Native.KEYBDINPUT { wVk = code, dwFlags = 1 } } };
                inputs[i * 2 + 1] = new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = new Native.KEYBDINPUT { wVk = code, dwFlags = 3 } } };
            }
            uint inserted = Native.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Native.INPUT>());
            if (inserted != inputs.Length)
            {
                // A partially accepted batch must never leave a media key held.
                Native.keybd_event((byte)code, 0, 3, UIntPtr.Zero);
                throw new InvalidOperationException("Windows could not send this media key. Unlock the PC and try again.");
            }
            Console.WriteLine("{\"ok\":true}");
        }
        catch (Exception error)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { ok = false, error = error.Message }));
            Environment.ExitCode = 1;
        }
    }
}
