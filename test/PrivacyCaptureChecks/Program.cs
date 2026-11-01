using Step = PrivacyCaptureVerification.Action;
static void Equal(Step actual,Step expected){if(actual!=expected)throw new Exception($"Expected {expected}, got {actual}");}
var normal=new PrivacyCaptureVerification(0);
Equal(normal.Observe(50,true),Step.ChangeProbe);
Equal(normal.Observe(100,false),Step.Wait); // A cached magenta image cannot prove live capture.
Equal(normal.Observe(150,true),Step.Complete);
var recovery=new PrivacyCaptureVerification(0);
Equal(recovery.Observe(2499,false),Step.Wait);
Equal(recovery.Observe(2500,false),Step.RestartCapture);
Equal(recovery.Observe(2600,true),Step.ChangeProbe);
Equal(recovery.Observe(5100,false),Step.RestartCapture);
Equal(recovery.Observe(5200,true),Step.Complete);
if(recovery.Restarts!=2)throw new Exception("Both phases must be able to recover independently");
foreach(bool live in new[]{false,true}){
    var failure=new PrivacyCaptureVerification(0);
    if(live)Equal(failure.Observe(0,true),Step.ChangeProbe);
    Equal(failure.Observe(2500,false),Step.RestartCapture);
    Equal(failure.Observe(4999,false),Step.Wait);
    Equal(failure.Observe(5000,false),Step.Fail);
}
Console.WriteLine("PASS: fresh live proof, recovery in both phases, bounded failure without accepting stale frames.");
