(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PCRSecondScreenPolicy=api;})(globalThis,function(){
 'use strict';
 const rates={low:12,med:20,hd:30,smooth:30,fluid:60};
 function dimensions(width,height,orientation='landscape'){width=Math.max(320,Math.min(8192,Math.round(Number(width)||1280)));height=Math.max(320,Math.min(8192,Math.round(Number(height)||720)));return orientation==='portrait'?{width:Math.min(width,height),height:Math.max(width,height)}:{width:Math.max(width,height),height:Math.min(width,height)};}
 function fit(width,height,sourceWidth,sourceHeight){if(![width,height,sourceWidth,sourceHeight].every(value=>Number.isFinite(value)&&value>0))return null;const scale=Math.min(width/sourceWidth,height/sourceHeight),w=sourceWidth*scale,h=sourceHeight*scale;return {left:(width-w)/2,top:(height-h)/2,width:w,height:h};}
 function preset({current='hd',actualFps=0,rtt=0,stalled=false,hardware=false,smooth60=false,stableMs=0}){const order=['low','med','hd','fluid'],index=Math.max(0,order.indexOf(current)),target=rates[current]||30;if(stalled||actualFps>0&&actualFps<target*.6||rtt>180&&actualFps<target*.9)return order[Math.max(0,index-1)];if(stableMs>=15000&&actualFps>=target*.85&&rtt<60){if(index<2)return order[index+1];if(hardware&&smooth60&&rtt<20)return 'fluid';}return current;}
 return {dimensions,fit,preset,rates};
});
