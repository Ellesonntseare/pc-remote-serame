'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{png}=require('../image-tools');
const sample='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('image tools accept bounded PNGs and reject other formats, malformed base64 and excessive dimensions',()=>{assert.deepEqual(png(sample),{width:1,height:1});for(const data of ['not an image',Buffer.from('<svg></svg>').toString('base64'),sample+'extra'])assert.throws(()=>png(data));const huge=Buffer.from(sample,'base64');huge.writeUInt32BE(65535,16);assert.throws(()=>png(huge.toString('base64')));});
