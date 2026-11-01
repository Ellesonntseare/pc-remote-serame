// A bounded recovery policy: a static pre-cover frame can never pass the live
// phase, and capture recovery never requires exposing the physical desktop.
internal sealed class PrivacyCaptureVerification(long now)
{
    internal enum Action { Wait, ChangeProbe, RestartCapture, Complete, Fail }
    private long deadline=now+2500;
    private bool retried;
    internal bool LivePhase { get; private set; }
    internal int Restarts { get; private set; }
    internal string Stage => LivePhase ? "live-update" : "cover-exclusion";
    internal Action Observe(long now,bool matched)
    {
        if(matched)
        {
            if(LivePhase)return Action.Complete;
            LivePhase=true;retried=false;deadline=now+2500;return Action.ChangeProbe;
        }
        if(now<deadline)return Action.Wait;
        if(retried)return Action.Fail;
        retried=true;Restarts++;deadline=now+2500;return Action.RestartCapture;
    }
}
