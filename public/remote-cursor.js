'use strict';
(() => {
  const stage=document.getElementById('screenStage'),canvas=document.getElementById('rsc');
  if(!stage||!canvas)return;
  const storageKey='pcr_pointer_size';
  function normalizedSize(value){
    const validType=typeof value==='number'||typeof value==='string'&&value.trim();
    const number=validType?Number(value):NaN;
    return Number.isFinite(number)?Math.min(250,Math.max(50,Math.round(number/10)*10)):100;
  }
  function arrowMarkup(value,namespace=false){
    const scale=value/100;
    return '<svg '+(namespace?'xmlns="http://www.w3.org/2000/svg" ':'')+'width="'+20*scale+'" height="'+26*scale+'" viewBox="0 0 20 26" aria-hidden="true" focusable="false"><path d="M1 1v21l5-6 4 9 4-2-4-9h8Z" fill="white" stroke="#101827" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  let size=100;
  try{const saved=window.localStorage.getItem(storageKey);if(saved!==null)size=normalizedSize(saved);}catch{}
  const cursor=document.createElement('div');cursor.className='remoteCursor';cursor.hidden=true;
  cursor.setAttribute('aria-hidden','true');
  cursor.style.pointerEvents='none';
  stage.append(cursor);let x=0,y=0,enabled=false,visible=false,lastPreview=-Infinity,sourceCursor='auto',embedded=false;
  let range=null,output=null,sizePreview=null,overlayPositioned=true;
  function checkOverlay(){
    // If the positioning stylesheet is unavailable, show a matching native
    // cursor only over the active canvas rather than a misplaced extra arrow.
    const style=window.getComputedStyle?.(cursor);
    overlayPositioned=!style||style.position==='absolute';
  }
  function setSize(value,persist=true){
    size=normalizedSize(value);
    cursor.innerHTML=arrowMarkup(size);
    cursor.style.width=20*size/100+'px';cursor.style.height=26*size/100+'px';
    canvas.style.setProperty('--remote-pointer-fallback','url("data:image/svg+xml,'+encodeURIComponent(arrowMarkup(size,true))+'") 0 0, default');
    if(range){range.value=String(size);range.setAttribute('aria-valuetext',size+' percent');}
    if(output)output.textContent=size+'%';
    if(sizePreview)sizePreview.innerHTML=arrowMarkup(size);
    if(persist)try{window.localStorage.setItem(storageKey,String(size));}catch{}
    draw();return size;
  }
  function resetSize(){return setSize(100);}
  function draw(){
    const inPicture=sourceCursor==='embedded'||sourceCursor==='auto'&&embedded;
    cursor.hidden=inPicture||!enabled||!visible||!rs.on||!rs.m||x<0||y<0||x>=rs.m.w||y>=rs.m.h;
    stage.classList.toggle('remoteCursorEmbedded',!!(inPicture&&rs.on));
    stage.classList.toggle('remoteCursorReady',!cursor.hidden);
    stage.classList.toggle('remoteCursorFallback',!cursor.hidden&&!overlayPositioned);
    if(cursor.hidden)return;
    const image=window.PCRScreenTools?.imageBox?.(),origin=stage.getBoundingClientRect?.();
    const scaleX=origin?.width&&stage.offsetWidth?origin.width/stage.offsetWidth:1;
    const scaleY=origin?.height&&stage.offsetHeight?origin.height/stage.offsetHeight:1;
    const left=image&&origin?(image.x-origin.left)/scaleX:canvas.offsetLeft;
    const top=image&&origin?(image.y-origin.top)/scaleY:canvas.offsetTop;
    const width=image?image.w/scaleX:canvas.clientWidth,height=image?image.h/scaleY:canvas.clientHeight;
    // Invert the same pixel-endpoint mapping used by direct touch. Reading the
    // actual image rectangle also preserves fractional sizes and fitted margins.
    cursor.style.left=(left+x/Math.max(1,rs.m.w-1)*width)+'px';
    cursor.style.top=(top+y/Math.max(1,rs.m.h-1)*height)+'px';
  }
  function report(state){
    if(!Number.isFinite(state.x)||!Number.isFinite(state.y)||!rs.m)return;
    embedded=state.embedded===true;
    enabled=true;
    if(performance.now()-lastPreview>150){x=state.x;y=state.y;visible=state.visible!==false;}
    draw();
  }
  function preview(command){
    if(!enabled||!rs.m)return;
    const [kind,a,b]=command.split(' ');
    if(!Number.isFinite(Number(a))||!Number.isFinite(Number(b)))return;
    if(kind==='abs'){x=Number(a);y=Number(b);}
    else if(kind==='mv'){x+=Number(a);y+=Number(b);}
    else return;
    x=Math.max(0,Math.min(rs.m.w-1,x));y=Math.max(0,Math.min(rs.m.h-1,y));
    visible=true;lastPreview=performance.now();draw();
  }
  function reset(){enabled=false;visible=false;embedded=false;lastPreview=-Infinity;draw();}
  function setSourceCursor(value){if(!['auto','embedded','overlay'].includes(value))return;sourceCursor=value;draw();}
  const settings=document.getElementById('rsSettings')?.querySelector('.controlSheet');
  if(settings){
    const group=document.createElement('section');group.className='pointerSizeSettings';
    const heading=document.createElement('div');heading.className='pointerSizeHeading';
    const label=document.createElement('label');label.htmlFor='pointerSize';label.textContent='Mouse pointer size';
    output=document.createElement('output');output.id='pointerSizeValue';output.setAttribute('for','pointerSize');
    heading.append(label,output);
    const row=document.createElement('div');row.className='pointerSizeRow';
    const preview=document.createElement('div');preview.className='pointerSizePreview';preview.setAttribute('aria-hidden','true');
    sizePreview=document.createElement('span');sizePreview.className='pointerSizePreviewArrow';preview.append(sizePreview);
    range=document.createElement('input');range.type='range';range.id='pointerSize';range.min='50';range.max='250';range.step='10';
    range.addEventListener('input',()=>setSize(range.value));
    const resetButton=document.createElement('button');resetButton.type='button';resetButton.className='pointerSizeReset';
    resetButton.textContent='Reset';resetButton.setAttribute('aria-label','Reset mouse pointer size');
    resetButton.addEventListener('click',resetSize);
    row.append(preview,range,resetButton);group.append(heading,row);
    const sensitivity=document.getElementById('sensitivity');
    if(sensitivity?.parentElement===settings)sensitivity.after(group);else settings.append(group);
  }
  checkOverlay();setSize(size,false);
  if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(()=>{checkOverlay();draw();});observer.observe(canvas);observer.observe(stage);}
  window.PCRCursor={report,preview,reset,setSourceCursor,setSize,resetSize,getSize:()=>size};
})();
