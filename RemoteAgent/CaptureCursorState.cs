// DXGI reports whether the pointer is separate from the desktop pixels.
// Frames without a mouse update carry no new pointer ownership information.
internal sealed class CaptureCursorState
{
    public bool Embedded { get; private set; }
    public bool Observe(long mouseUpdateTime, bool separatePointerVisible)
    {
        if (mouseUpdateTime == 0) return false;
        bool next = !separatePointerVisible;
        if (next == Embedded) return false;
        Embedded = next;
        return true;
    }
}
