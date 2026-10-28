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
Console.WriteLine("Phone arrangement: four edges, negative monitor coordinates, entry and return positions passed. No mouse hooks installed.");
