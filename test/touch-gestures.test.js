'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{create}=require('../public/touch-gestures');
const points=(ax,ay,bx,by)=>[{id:1,x:ax,y:ay},{id:2,x:bx,y:by}];
test('parallel finger movement scrolls without changing zoom',()=>{const g=create(points(0,0,100,0));assert.equal(g.update(points(0,2,100,2)),null);assert.deepEqual(g.update(points(0,12,100,12)),{type:'scroll',dx:0,dy:10});assert.equal(g.mode,'scroll');});
test('spreading fingers zooms with a stable midpoint and remains a pinch after movement',()=>{const g=create(points(0,0,100,0),1.5);assert.deepEqual(g.update(points(-25,0,125,0)),{type:'pinch',zoom:2.25,x:50,y:0});assert.equal(g.update(points(-50,20,150,20)).zoom,3);assert.equal(g.mode,'pinch');});
test('pinch limits, swapped touch order, lifted fingers and invalid starts are handled',()=>{const g=create(points(0,0,100,0),3);assert.equal(g.update(points(-100,0,200,0)).zoom,4);assert.equal(g.update(points(49,0,51,0).reverse()).zoom,1);assert.equal(g.update([{id:2,x:0,y:0}]),null);assert.equal(create([]),null);assert.equal(create([{id:1,x:0,y:0},{id:1,x:10,y:0}]),null);});
