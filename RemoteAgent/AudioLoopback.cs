using NAudio.Wave;
using System.Collections.Concurrent;
using System.Text.Json;

// Only --audio enters this path. WASAPI loopback reads the default rendering
// endpoint; no microphone is opened and no audio is written to disk.
internal static class AudioLoopback
{
    private static void Packet(Stream output, byte type, ReadOnlySpan<byte> data)
    {
        Span<byte> header = stackalloc byte[5];
        header[0] = type;
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(header[1..], data.Length);
        output.Write(header); output.Write(data); output.Flush();
    }

    public static void Run()
    {
        using var stdout = Console.OpenStandardOutput();
        try
        {
            using var capture = new WasapiLoopbackCapture();
            // Explicit output conversion keeps the browser protocol predictable,
            // including PCs whose default mix format has more than two channels.
            capture.WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
            using var queue = new BlockingCollection<byte[]>(4);
            using var stopped = new ManualResetEventSlim();
            Exception? failure = null;
            capture.DataAvailable += (sender, e) =>
            {
                if (e.BytesRecorded <= 0 || e.BytesRecorded % 8 != 0 || queue.IsAddingCompleted) return;
                byte[] data = e.Buffer.AsSpan(0, e.BytesRecorded).ToArray();
                // A slow network must never block the sound card's callback.
                // Drop the oldest capture block instead of building latency.
                try { if (!queue.TryAdd(data)) { queue.TryTake(out _); queue.TryAdd(data); } }
                catch (InvalidOperationException) { }
            };
            capture.RecordingStopped += (_, e) => { failure = e.Exception; stopped.Set(); };
            var input = new Thread(() =>
            {
                try { while (Console.ReadLine() is string line) if (line == "stop") break; }
                catch { }
                try { stopped.Set(); } catch (ObjectDisposedException) { }
            }) { IsBackground = true };
            input.Start();
            Packet(stdout, 1, JsonSerializer.SerializeToUtf8Bytes(new {
                type = "format", encoding = "f32le", sampleRate = 48000, channels = 2, source = "system-output"
            }));
            capture.StartRecording();
            try
            {
                while (!stopped.IsSet)
                    if (queue.TryTake(out byte[]? data, 100)) Packet(stdout, 0, data);
            }
            finally
            {
                capture.StopRecording();
                // StopRecording requests an asynchronous stop. Join the capture
                // thread before disposing the queue/event used by its callbacks.
                capture.Dispose();
                queue.CompleteAdding();
            }
            if (failure != null) throw failure;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("System output audio unavailable: " + ex.Message);
            try { Packet(stdout, 2, JsonSerializer.SerializeToUtf8Bytes(new { type = "error", error = "PC audio is unavailable. Check the PC output device, then try again." })); } catch { }
            Environment.ExitCode = 1;
        }
    }
}
