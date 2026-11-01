var cursor=new CaptureCursorState();
void Check(bool expected){if(cursor.Embedded!=expected)throw new Exception("Wrong cursor composition state");}
Check(false);
if(!cursor.Observe(1,false))throw new Exception("Software cursor transition was lost");Check(true);
if(cursor.Observe(0,true))throw new Exception("A frame without a mouse update must retain ownership");Check(true);
if(!cursor.Observe(2,true))throw new Exception("Hardware cursor transition was lost");Check(false);
if(cursor.Observe(0,false))throw new Exception("An unchanged frame cannot hide the separate cursor");Check(false);
if(cursor.Observe(3,true))throw new Exception("An unchanged owner should not invalidate screen pixels");
Console.WriteLine("PASS: embedded/separate cursor transitions and unchanged-frame ownership.");
