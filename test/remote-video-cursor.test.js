'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('Remote chooses one cursor provider for native, browser video and compatibility fallback',async t=>{
 const dom=new JSDOM('<div id="screenTools"></div><canvas id="rsc"></canvas>',{url:'https://pc.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,owners=[],sessions=[];let native;
 t.after(()=>w.close());w.rs={on:true,m:{w:1920,h:1080},qi:0};w.QN=['hd'];w.rsOpen=()=>{};w.rsClose=()=>{};w.rsRun=()=>{};w.PCRCursor={setSourceCursor:value=>owners.push(value)};w.PCRVideo={VideoSession:class{constructor(options){sessions.push(options);}stop(){}},displayCaptureOptions:()=>({video:{}})};w.PCRNativeVideo={NativeVideoSession:class{constructor(options){native=options;}stop(){}}};
 w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLVideoElement.prototype.requestVideoFrameCallback=()=>1;w.HTMLVideoElement.prototype.cancelVideoFrameCallback=()=>{};
 Object.defineProperties(w.HTMLVideoElement.prototype,{readyState:{get:()=>2},videoWidth:{get:()=>1920},videoHeight:{get:()=>1080}});
 w.eval(fs.readFileSync(path.join(__dirname,'../public/remote-video.js'),'utf8'));
 const frame={displayWidth:1920,displayHeight:1080};native.onFrame(frame,{cursorEmbedded:true});assert.equal(owners.at(-1),'embedded');native.onFrame(frame,{cursorEmbedded:false});assert.equal(owners.at(-1),'overlay');native.onFrame(frame,{});assert.equal(owners.at(-1),'auto');
 await sessions[0].onStream({getAudioTracks:()=>[]});assert.equal(owners.at(-1),'embedded');await sessions[0].onStream(null);assert.equal(owners.at(-1),'auto','a video fallback must restore the normal cursor');
});
