using System.Drawing;
var monitor=new Rectangle(-1920,-200,1920,1080);
foreach(var side in new[]{"left","right","top","bottom"}){
    var point=side switch{"left"=>new Point(monitor.Left,200),"right"=>new Point(monitor.Right-1,200),"top"=>new Point(-800,monitor.Top),_=>new Point(-800,monitor.Bottom-1)};
    if(!PhoneDeskGeometry.AtEdge(monitor,point,side))throw new Exception("Missed screen edge "+side);
    var start=PhoneDeskGeometry.Enter(monitor,point,side);if(start.X<0||start.X>1||start.Y<0||start.Y>1)throw new Exception("Invalid normalized pointer");
    var end=PhoneDeskGeometry.Return(monitor,start.X,start.Y,side);if(!monitor.Contains(end))throw new Exception("PC cursor restored outside its monitor");
    var (x,y)=side switch{"left"=>(1.1,.5),"right"=>(-.1,.5),"top"=>(.5,1.1),_=>(.5,-.1)};
    if(!PhoneDeskGeometry.Returns(x,y,side))throw new Exception("Cannot return from phone "+side);
}
if(PhoneDeskGeometry.ValidSide("anything"))throw new Exception("Unknown position accepted");
var phone=new Size(800,600);
foreach(var side in new[]{"left","right","top","bottom"})
{
    var start=PhoneDeskGeometry.PlaceDisplay(monitor,phone,side,-100);
    var center=PhoneDeskGeometry.PlaceDisplay(monitor,phone,side,0);
    var end=PhoneDeskGeometry.PlaceDisplay(monitor,phone,side,100);
    bool vertical=side is "left" or "right";
    if(vertical ? !(start.Y<center.Y&&center.Y<end.Y) : !(start.X<center.X&&center.X<end.X))
        throw new Exception("Phone cannot slide along the "+side+" edge");
    foreach(var point in new[]{start,center,end})
    {
        var display=new Rectangle(point,phone);
        bool adjacent=side switch{"left"=>display.Right==monitor.Left,"right"=>display.Left==monitor.Right,"top"=>display.Bottom==monitor.Top,_=>display.Top==monitor.Bottom};
        int overlap=vertical?Math.Min(monitor.Bottom,display.Bottom)-Math.Max(monitor.Top,display.Top):Math.Min(monitor.Right,display.Right)-Math.Max(monitor.Left,display.Left);
        if(!adjacent||overlap<80)throw new Exception("Phone lost its shared screen edge "+side);
    }
}
Console.WriteLine("Phone arrangement: four edges, negative monitor coordinates, entry and return positions passed. No mouse hooks installed.");
