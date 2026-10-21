(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PCRTouchGestures=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function pair(points,ids){const selected=ids.map(id=>points.find(p=>p.id===id));if(selected.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;const [a,b]=selected;return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  function create(points,startZoom=1){
    if(!Array.isArray(points)||points.length!==2||points[0].id===points[1].id)return null;const ids=points.map(p=>p.id),start=pair(points,ids);if(!start)return null;let previous=start,mode=null;
    return {update(points){const current=pair(points,ids);if(!current)return null;const spread=Math.abs(current.distance-start.distance),travel=Math.hypot(current.x-start.x,current.y-start.y);
      if(!mode){if(spread>Math.max(10,start.distance*.06))mode='pinch';else if(travel>6&&spread<Math.max(8,travel*.6))mode='scroll';}
      const value=mode==='pinch'?{type:'pinch',zoom:Math.min(4,Math.max(1,startZoom*current.distance/start.distance)),x:current.x,y:current.y}:mode==='scroll'?{type:'scroll',dx:current.x-previous.x,dy:current.y-previous.y}:null;previous=current;return value;},get mode(){return mode;}};
  }
  return {create};
});
