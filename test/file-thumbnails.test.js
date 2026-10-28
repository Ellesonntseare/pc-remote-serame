'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createThumbnails}=require('../file-thumbnails');
const data=Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64');
test('Windows previews share pending work, cache each file version and bound shell concurrency',async()=>{
  let active=0,peak=0,calls=0;const release=[];const thumbnails=createThumbnails(async()=>{active++;peak=Math.max(peak,active);calls++;await new Promise(r=>release.push(r));active--;return{data};});const first=thumbnails.get('photo.jpg',1),duplicate=thumbnails.get('photo.jpg',1),second=thumbnails.get('video.mp4',1),third=thumbnails.get('folder',1);assert.equal(first,duplicate);await new Promise(setImmediate);assert.equal(calls,2);release.shift()();release.shift()();await Promise.all([first,second]);await new Promise(setImmediate);assert.equal(calls,3);release.shift()();await third;await thumbnails.get('photo.jpg',1);assert.equal(calls,3);const newer=thumbnails.get('photo.jpg',2);await new Promise(setImmediate);release.shift()();await newer;assert.equal(calls,4);assert.equal(peak,2);thumbnails.close();await assert.rejects(thumbnails.get('photo.jpg',1));
});
test('invalid shell output is rejected instead of being served as an image',async()=>{
  const thumbnails=createThumbnails(async()=>({data:Buffer.from('not a PNG').toString('base64')}));await assert.rejects(thumbnails.get('file',1),/Invalid Windows preview/);thumbnails.close();
});
