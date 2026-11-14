using System.Drawing;
internal static class PhoneDeskGeometry
{
    internal static bool ValidSide(string value)=>value is "left" or "right" or "top" or "bottom";
    internal static Point PlaceDisplay(Rectangle primary, Size phone, string side, int? alignment)
    {
        bool vertical = side is "left" or "right";
        int pcEdge = vertical ? primary.Height : primary.Width;
        int phoneEdge = vertical ? phone.Height : phone.Width;
        int shared = Math.Min(80, Math.Min(pcEdge, phoneEdge));
        int min = shared - phoneEdge, max = pcEdge - shared;
        int offset = alignment.HasValue ? min + (int)Math.Round((max - min) * (Math.Clamp(alignment.Value, -100, 100) + 100) / 200d) : 0;
        return side switch
        {
            "left" => new(primary.Left - phone.Width, primary.Top + offset),
            "right" => new(primary.Right, primary.Top + offset),
            "top" => new(primary.Left + offset, primary.Top - phone.Height),
            _ => new(primary.Left + offset, primary.Bottom)
        };
    }
    internal static bool AtEdge(Rectangle screen,Point point,string side)=>side switch{
        "left"=>point.X<=screen.Left,"right"=>point.X>=screen.Right-1,"top"=>point.Y<=screen.Top,_=>point.Y>=screen.Bottom-1};
    internal static (double X,double Y) Enter(Rectangle screen,Point point,string side)=>side switch{
        "left"=>(.995,Math.Clamp((point.Y-screen.Top)/(double)Math.Max(1,screen.Height-1),0,1)),
        "right"=>(.005,Math.Clamp((point.Y-screen.Top)/(double)Math.Max(1,screen.Height-1),0,1)),
        "top"=>(Math.Clamp((point.X-screen.Left)/(double)Math.Max(1,screen.Width-1),0,1),.995),
        _=>(Math.Clamp((point.X-screen.Left)/(double)Math.Max(1,screen.Width-1),0,1),.005)};
    internal static bool Returns(double x,double y,string side)=>side switch{"left"=>x>1,"right"=>x<0,"top"=>y>1,_=>y<0};
    internal static Point Return(Rectangle screen,double x,double y,string side)=>side switch{
        "left"=>new(screen.Left+12,screen.Top+(int)(Math.Clamp(y,0,1)*(screen.Height-1))),
        "right"=>new(screen.Right-13,screen.Top+(int)(Math.Clamp(y,0,1)*(screen.Height-1))),
        "top"=>new(screen.Left+(int)(Math.Clamp(x,0,1)*(screen.Width-1)),screen.Top+12),
        _=>new(screen.Left+(int)(Math.Clamp(x,0,1)*(screen.Width-1)),screen.Bottom-13)};
}
