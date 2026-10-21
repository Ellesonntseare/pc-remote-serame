'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/remote-cursor.js'),'utf8');

function cursorHarness(options={}){
  const nodes=[],resizeCallbacks=[],saved=new Map(Object.entries(options.saved||{}));
  let now=1000;
  function node(tag='div'){
    const classes=new Set(),attributes={},listeners={};
    const value={tagName:tag.toUpperCase(),children:[],attributes,listeners,hidden:false,value:'',textContent:'',dataset:{},
      style:{setProperty(name,value){this[name]=String(value);},getPropertyValue(name){return this[name]||'';}},
      classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name),toggle(name,force){const enabled=force===undefined?!classes.has(name):force;enabled?classes.add(name):classes.delete(name);return enabled;}},
      append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}},
      appendChild(child){this.append(child);return child;},
      setAttribute(name,text){attributes[name]=String(text);if(['id','class','value','min','max','step','type'].includes(name))this[name==='class'?'className':name]=String(text);},
      getAttribute(name){return attributes[name]??null;},
      addEventListener(name,fn){(listeners[name]??=[]).push(fn);},
      emit(name){const event={target:this,currentTarget:this,preventDefault(){},stopPropagation(){}};for(const fn of listeners[name]||[])fn(event);},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
      querySelectorAll(selector){const matches=[];function visit(parent){for(const child of parent.children){if(selector[0]==='#'?child.id===selector.slice(1):selector[0]==='.'?child.classList.contains(selector.slice(1)):child.tagName===selector.toUpperCase())matches.push(child);visit(child);}}visit(this);return matches;},
      insertBefore(child,before){const index=this.children.indexOf(before);if(index<0)this.append(child);else{this.children.splice(index,0,child);child.parentElement=this;}},
      insertAdjacentHTML(_position,html){parseHTML(this,html);}
    };
    Object.defineProperty(value,'className',{get(){return [...classes].join(' ');},set(text){classes.clear();String(text).split(/\s+/).filter(Boolean).forEach(name=>classes.add(name));}});
    Object.defineProperty(value,'innerHTML',{set(html){this.children=[];parseHTML(this,html);}});
    nodes.push(value);return value;
  }
  function parseHTML(parent,html){
    const stack=[parent];
    for(const token of String(html).matchAll(/<\/?[\w:-]+\b[^>]*>|[^<]+/g)){
      const part=token[0];
      if(part.startsWith('</')){if(stack.length>1)stack.pop();continue;}
      if(!part.startsWith('<')){stack.at(-1).textContent+=part;continue;}
      const tag=part.match(/^<([\w:-]+)/)[1],child=node(tag);
      for(const attr of part.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))child.setAttribute(attr[1],attr[2]??attr[3]);
      stack.at(-1).append(child);
      if(!['input','br','hr','img'].includes(tag)&&!part.endsWith('/>'))stack.push(child);
    }
  }
  const stage=node(),canvas=node('canvas'),settings=node(),sheet=node();
  stage.id='screenStage';canvas.id='rsc';settings.id='rsSettings';sheet.className='controlSheet';settings.append(sheet);stage.append(canvas);
  Object.assign(canvas,{offsetLeft:17,offsetTop:23,clientWidth:800,clientHeight:450});
  const document={createElement:node,createElementNS:(_namespace,tag)=>node(tag),getElementById:id=>nodes.find(value=>value.id===id)||null,
    querySelector(selector){if(selector==='#rsSettings .controlSheet')return sheet;return selector[0]==='#'?this.getElementById(selector.slice(1)):nodes.find(value=>selector[0]==='.'?value.classList.contains(selector.slice(1)):value.tagName===selector.toUpperCase())||null;}};
  const storage={getItem(key){if(options.readFails)throw new Error('Storage unavailable');return saved.get(key)??null;},setItem(key,value){if(options.writeFails)throw new Error('Storage unavailable');saved.set(key,String(value));},removeItem(key){if(options.writeFails)throw new Error('Storage unavailable');saved.delete(key);}};
  const window={localStorage:storage,getComputedStyle:()=>({position:options.cursorPosition||'absolute'})},rs={on:true,m:{w:1920,h:1080}};
  vm.runInNewContext(source,{window,document,rs,localStorage:storage,performance:{now:()=>now},ResizeObserver:class{constructor(fn){resizeCallbacks.push(fn);}observe(){}}});
  return {api:window.PCRCursor,stage,canvas,settings,sheet,saved,rs,document,byClass:name=>nodes.find(value=>value.classList.contains(name)),
    resize(){resizeCallbacks.forEach(fn=>fn());},advance(ms){now+=ms;}};
}

function position(pointer){return [pointer.style.left,pointer.style.top];}
function near(actual,expected){assert.ok(Math.abs(parseFloat(actual)-expected)<1e-7,`${actual} should equal ${expected}`);}

test('pointer size loads valid saved values and normalizes missing, invalid and out of range settings',()=>{
  for(const [saved,expected] of [[undefined,100],['',100],['   ',100],['NaN',100],['large',100],['130px',100],['180',180],['54',50],['56',60],['124',120],['126',130],['999',250],['-9',50]]){
    const c=cursorHarness({saved:saved===undefined?{}:{pcr_pointer_size:saved}});
    assert.equal(c.api.getSize(),expected,`saved setting ${JSON.stringify(saved)}`);
    assert.equal(Number(c.document.getElementById('pointerSize').value),expected);
    assert.equal(c.document.getElementById('pointerSizeValue').textContent,`${expected}%`);
  }
});

test('settings slider updates the pointer preference and reset restores a persistent default',()=>{
  const c=cursorHarness(),slider=c.document.getElementById('pointerSize'),output=c.document.getElementById('pointerSizeValue');
  assert.ok(c.sheet.querySelector('#pointerSize'),'the existing Controls sheet contains the slider');
  assert.equal(slider.type,'range');assert.equal(Number(slider.min),50);assert.equal(Number(slider.max),250);assert.equal(Number(slider.step),10);
  assert.ok(c.byClass('pointerSizePreviewArrow'),'settings include a local visual preview');
  slider.value='170';slider.emit('input');
  assert.equal(c.api.getSize(),170);assert.equal(output.textContent,'170%');assert.equal(c.saved.get('pcr_pointer_size'),'170');
  assert.equal(cursorHarness({saved:Object.fromEntries(c.saved)}).api.getSize(),170,'a fresh session restores the slider choice');
  c.byClass('pointerSizeReset').emit('click');
  assert.equal(c.api.getSize(),100);assert.equal(Number(slider.value),100);assert.equal(output.textContent,'100%');
  assert.equal(cursorHarness({saved:Object.fromEntries(c.saved)}).api.getSize(),100,'reset survives a new session');
});

test('standard arrow and local preview scale together while keeping the arrow proportions',()=>{
  const c=cursorHarness(),pointer=c.byClass('remoteCursor'),preview=c.byClass('pointerSizePreviewArrow');
  for(const [size,width,height] of [[100,20,26],[250,50,65],[50,10,13]]){
    c.api.setSize(size);
    for(const container of [pointer,preview]){
      const svg=container.querySelector('svg');
      assert.equal(Number(svg.getAttribute('width')),width);assert.equal(Number(svg.getAttribute('height')),height);
      assert.equal(svg.getAttribute('viewBox'),'0 0 20 26','visual sizing preserves the standard arrow geometry');
    }
    assert.equal(parseFloat(pointer.style.width),width);assert.equal(parseFloat(pointer.style.height),height);
  }
});

test('size API clamps and rounds settings and remains usable when storage is blocked',()=>{
  const c=cursorHarness({readFails:true,writeFails:true});
  assert.equal(c.api.getSize(),100);
  for(const [value,expected] of [[999,250],[-100,50],[145,150],['180',180],['',100],[NaN,100],[Infinity,100],[null,100],[true,100],[{},100]]){
    assert.doesNotThrow(()=>c.api.setSize(value));assert.equal(c.api.getSize(),expected);
  }
  const slider=c.document.getElementById('pointerSize');slider.value='220';
  assert.doesNotThrow(()=>slider.emit('input'));assert.equal(c.api.getSize(),220);
  assert.doesNotThrow(()=>c.api.resetSize());assert.equal(c.api.getSize(),100);
});

test('changing pointer size preserves its reported hotspot and local movement prediction',()=>{
  const c=cursorHarness(),pointer=c.byClass('remoteCursor');
  c.api.report({x:1000,y:500,visible:true});const initial=position(pointer);
  assert.equal(pointer.hidden,false);near(initial[0],17+1000/1920*800);near(initial[1],23+500/1080*450);
  c.api.setSize(250);assert.deepEqual(position(pointer),initial);
  c.api.preview('mv 120 -100');const predicted=position(pointer);
  c.api.setSize(50);assert.deepEqual(position(pointer),predicted);
  c.advance(100);c.api.report({x:1000,y:500,visible:true});assert.deepEqual(position(pointer),predicted,'recent local movement keeps its prediction during size changes');
  c.advance(51);c.api.report({x:1000,y:500,visible:true});assert.deepEqual(position(pointer),initial,'server reports reconcile after the existing 150 ms interval');
});

test('zoom and pan resize the pointer position independently of its visual size',()=>{
  const c=cursorHarness(),pointer=c.byClass('remoteCursor');
  c.api.report({x:720,y:300,visible:true});c.api.setSize(190);
  Object.assign(c.canvas,{offsetLeft:-310,offsetTop:-160,clientWidth:1600,clientHeight:900});c.resize();
  near(pointer.style.left,-310+720/1920*1600);near(pointer.style.top,-160+300/1080*900);
  const zoomed=position(pointer);c.api.resetSize();assert.deepEqual(position(pointer),zoomed);
  c.api.preview('abs 0 0');assert.deepEqual(position(pointer),['-310px','-160px'],'the top left hotspot remains at the screen origin');
});

test('visibility and stream reset retain pointer size without displaying a stale pointer',()=>{
  const c=cursorHarness(),pointer=c.byClass('remoteCursor');
  c.api.setSize(180);assert.equal(pointer.hidden,true);
  c.api.report({x:900,y:300,visible:true});assert.equal(pointer.hidden,false);
  c.api.report({x:900,y:300,visible:false});assert.equal(pointer.hidden,true);
  c.api.setSize(200);assert.equal(pointer.hidden,true);
  c.api.report({x:900,y:300,visible:true});c.api.reset();assert.equal(pointer.hidden,true);assert.equal(c.api.getSize(),200);
  c.api.preview('mv 1 1');assert.equal(pointer.hidden,true);
  c.api.report({x:250,y:150,visible:true});assert.equal(pointer.hidden,false);assert.equal(c.api.getSize(),200);
});

test('the remote pointer cannot intercept touch, mouse or trackpad gestures',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/screen-tools.css'),'utf8');
  assert.match(css,/\.remoteCursor\s*\{[^}]*pointer-events\s*:\s*none\b/);
  const c=cursorHarness();assert.equal(c.byClass('remoteCursor').getAttribute('aria-hidden'),'true');
});

test('missing positioning styles use a matching native cursor only while a remote pointer is active',()=>{
  const c=cursorHarness({cursorPosition:'static'});
  assert.equal(c.stage.classList.contains('remoteCursorFallback'),false);
  c.api.setSize(200);
  const fallback=c.canvas.style.getPropertyValue('--remote-pointer-fallback');
  const encoded=fallback.match(/^url\("data:image\/svg\+xml,([^"]+)"\) 0 0, default$/);
  assert.ok(encoded,'native fallback uses the same top left hotspot');
  const svg=decodeURIComponent(encoded[1]);assert.match(svg,/width="40"/);assert.match(svg,/height="52"/);
  c.api.report({x:500,y:300,visible:true});assert.equal(c.stage.classList.contains('remoteCursorFallback'),true);
  c.api.report({x:500,y:300,visible:false});assert.equal(c.stage.classList.contains('remoteCursorFallback'),false);
  c.api.report({x:500,y:300,visible:true});c.api.reset();
  assert.equal(c.stage.classList.contains('remoteCursorFallback'),false);assert.equal(c.stage.classList.contains('remoteCursorReady'),false);
});
