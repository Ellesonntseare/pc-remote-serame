'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/precision-lens.js'),'utf8');

function lens(options={}){
  const nodes=[],frames=new Map(),draws=[],commands=[];let nextFrame=1,now=1000;
  const document={activeElement:null,listeners:{},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}};
  function node(tag='div'){
    const classes=new Set(),listeners={};
    const value={tagName:tag.toUpperCase(),children:[],style:{},attributes:{},listeners,hidden:false,disabled:false,width:300,height:150,clientWidth:208,clientHeight:112,
      rect:{left:0,top:0,width:360,height:202.5},
      classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
      append(...children){for(const child of children){this.children.push(child);child.parent=this;}},
      setAttribute(name,text){this.attributes[name]=String(text);},
      getAttribute(name){return this.attributes[name];},
      insertAdjacentHTML(){},
      addEventListener(name,fn){(listeners[name]??=[]).push(fn);},
      getBoundingClientRect(){return this.rect;},
      contains(target){return this===target||this.children.some(child=>child.contains(target));},
      focus(){document.activeElement=this;},
      getContext(){return {clearRect(){draws.push({clear:true});},drawImage(...args){draws.push({args});}}},
      emit(name,event={}){event.stopPropagation??=()=>{};event.preventDefault??=()=>{};for(const fn of listeners[name]||[])fn(event);}
    };
    Object.defineProperty(value,'className',{get(){return [...classes].join(' ');},set(text){classes.clear();text.split(/\s+/).filter(Boolean).forEach(name=>classes.add(name));}});
    nodes.push(value);return value;
  }
  const screen=node(),view=node(),desktop=node('canvas'),bar=node();
  desktop.width=options.bitmapW||1920;desktop.height=options.bitmapH||1080;
  screen.querySelector=selector=>selector==='.rsbot'?bar:null;
  screen.append(view,bar);view.append(desktop);
  const ids={rs:screen,rsv:view,rsc:desktop};
  document.createElement=node;document.getElementById=id=>ids[id]||nodes.find(value=>value.id===id)||null;
  const window={devicePixelRatio:options.dpr||1,listeners:{},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}};
  const rs={on:1,m:{w:options.remoteW||3840,h:options.remoteH||2160},ab:{id:1},mode:'pad'};
  let canPoint=true;
  const context=vm.createContext({window,document,rs,performance:{now:()=>now},
    requestAnimationFrame(fn){const id=nextFrame++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},
    rsCanPoint:()=>canPoint,qc(command){commands.push(command);window.PCRPrecisionLens.preview(command);}
  });
  vm.runInContext(source,context);
  const api=window.PCRPrecisionLens;
  const byClass=name=>nodes.find(value=>value.classList.contains(name));
  function paint(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}}
  function live(x=1920,y=1080){api.report({x,y,visible:true});api.frame();byClass('precisionLensToggle').emit('click');paint();}
  const sample=()=>draws.filter(value=>value.args).at(-1)?.args;
  return {api,screen,view,desktop,window,rs,document,commands,draws,byClass,paint,live,sample,
    advance(ms){now+=ms;},blockPointing(){canPoint=false;}};
}
function near(value,expected){assert.ok(Math.abs(value-expected)<1e-7,`${value} should equal ${expected}`);}

test('lens waits for a rendered frame and never sends input when opening or drawing',()=>{
  const l=lens(),toggle=l.byClass('precisionLensToggle'),panel=l.byClass('precisionLens');
  assert.equal(toggle.disabled,true);assert.equal(panel.hidden,true);
  l.api.report({x:1500,y:700});assert.equal(toggle.disabled,true);
  l.api.frame();assert.equal(toggle.disabled,false);assert.equal(panel.hidden,true);
  toggle.emit('click');l.paint();assert.equal(panel.hidden,false);assert.ok(l.sample());
  assert.deepEqual(l.commands,[]);
  assert.equal(toggle.getAttribute('aria-pressed'),'true');
});

test('source crop maps desktop coordinates into a lower resolution frame and a high DPI preview',()=>{
  const l=lens({dpr:2});l.live(1920,1080);
  const [,left,top,width,height,,,targetW,targetH]=l.sample();
  near(width,208/2.75*1920/360);near(height,112/2.75*1080/202.5);
  near(left,1920/3839*1919-width/2);near(top,1080/2159*1079-height/2);
  assert.equal(targetW,416);assert.equal(targetH,224);
  assert.equal(l.byClass('precisionLensCanvas').width,416);
  near(parseFloat(l.byClass('precisionLensCrosshair').style.left),50);
  near(parseFloat(l.byClass('precisionLensCrosshair').style.top),50);
});

test('edge coordinates and local pointer previews clamp to the desktop without sampling outside the bitmap',()=>{
  const l=lens();l.live(-100,1e9);
  let [,left,top,width,height]=l.sample();
  assert.equal(left,0);near(top,1080-height);
  assert.equal(l.byClass('precisionLensCrosshair').style.left,'0%');
  near(parseFloat(l.byClass('precisionLensCrosshair').style.top),(1079-top)/height*100);
  l.api.preview('abs 99999 -100');l.paint();
  [,left,top,width]=l.sample();near(left,1920-width);assert.equal(top,0);
  assert.equal(l.byClass('precisionLensCrosshair').style.top,'0%');
  const samples=l.draws.filter(value=>value.args).length;
  l.api.preview('mv NaN 4');l.api.preview('click l');l.paint();
  assert.equal(l.draws.filter(value=>value.args).length,samples,'invalid and non-movement commands never redraw a false pointer');
});

test('zoom changes sampled area while panning offsets do not change the remote pointer position',()=>{
  const l=lens();l.live(1300,700);const before=l.sample();
  l.desktop.rect={left:-600,top:-300,width:720,height:405};
  l.api.frame();l.paint();const after=l.sample();
  near(after[3],before[3]/2);near(after[4],before[4]/2);
  near(after[1]+after[3]/2,1300/3839*1919);
  near(after[2]+after[4]/2,700/2159*1079);
  near(parseFloat(l.byClass('precisionLensCrosshair').style.left),50);
});

test('fine movement preserves fractional deltas and leaves normal movement unchanged when off or in clean fullscreen',()=>{
  const l=lens();assert.equal(l.api.scaleMovement(3,-5).dx,3);
  l.live();near(l.api.scaleMovement(.6,-1.2).dx,.15);near(l.api.scaleMovement(.6,-1.2).dy,-.3);
  l.byClass('precisionLensFine').emit('click');assert.equal(l.api.scaleMovement(3,-5).dx,3);
  l.byClass('precisionLensFine').emit('click');
  l.screen.classList.add('screenClean');l.api.frame();l.paint();
  assert.equal(l.byClass('precisionLens').hidden,true);assert.equal(l.api.scaleMovement(3,-5).dx,3);
  l.screen.classList.remove('screenClean');l.api.frame();l.paint();
  assert.equal(l.byClass('precisionLens').hidden,false);near(l.api.scaleMovement(3,-5).dy,-1.25);
  l.byClass('precisionLensClose').emit('click');assert.equal(l.api.scaleMovement(3,-5).dx,3);
});

test('disconnect and a new stream clear stale pixels and wait for that stream frame',()=>{
  const l=lens();l.live();const panel=l.byClass('precisionLens'),toggle=l.byClass('precisionLensToggle');
  l.api.disconnected();assert.equal(panel.hidden,true);assert.equal(toggle.disabled,true);
  l.rs.ab={id:2};l.api.report({x:500,y:600});l.paint();
  assert.equal(panel.hidden,true,'pointer metadata cannot revive the old canvas');
  l.api.frame();l.paint();assert.equal(panel.hidden,false);
  near(l.sample()[1]+l.sample()[3]/2,500/3839*1919);
  l.rs.ab={id:3};l.api.report({x:1000,y:600});l.paint();
  assert.equal(panel.hidden,true,'source identity protects even if a connecting hook was missed');
  l.api.frame();l.paint();assert.equal(panel.hidden,false);
  l.api.closed();assert.equal(panel.hidden,true);assert.equal(toggle.getAttribute('aria-pressed'),'false');
  assert.equal(l.api.scaleMovement(4,4).dx,4);
});

test('nudges send one exact remote pixel and click uses the normal command guard',()=>{
  const l=lens();l.live(1500,800);
  const controls=l.byClass('precisionLensNudges').children;
  controls[0].emit('click');controls[1].emit('click');controls[2].emit('click');controls[3].emit('click');controls[4].emit('click');
  assert.deepEqual(l.commands,['mv -1 0','mv 0 -1','click l','mv 0 1','mv 1 0']);
  l.blockPointing();controls[0].emit('click');assert.equal(l.commands.length,5);
  l.api.disconnected();controls[2].emit('click');assert.equal(l.commands.length,5);
});

test('fine nudges stop at the displayed desktop boundary',()=>{
  const l=lens();l.live(0,0);const controls=l.byClass('precisionLensNudges').children;
  controls[0].emit('click');controls[1].emit('click');assert.deepEqual(l.commands,[]);
  controls[4].emit('click');controls[3].emit('click');assert.deepEqual(l.commands,['mv 1 0','mv 0 1']);
});

test('server pointer reports reconcile after the local prediction lead and hidden pointers disable fine targets',()=>{
  const l=lens();l.live(1500,800);l.api.preview('abs 2000 1000');
  l.api.report({x:1500,y:800});l.paint();near(l.sample()[1]+l.sample()[3]/2,2000/3839*1919);
  l.advance(151);l.api.report({x:1700,y:900});l.paint();near(l.sample()[1]+l.sample()[3]/2,1700/3839*1919);
  l.api.report({x:1700,y:900,visible:false});l.paint();
  assert.equal(l.byClass('precisionLensCrosshair').hidden,true);
  assert.equal(l.byClass('precisionLensWaiting').hidden,false);
  assert.equal(l.byClass('precisionLensNudges').children[2].disabled,true);
});
