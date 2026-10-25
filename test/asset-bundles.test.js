'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{gunzipSync}=require('node:zlib');
const {planPage,createAssetBundles}=require('../asset-bundles');

test('startup bundles preserve script order and the stylesheet cascade around inline styles',()=>{
  const allowed=new Map([['/a.js',['a','text/javascript']],['/b.js',['b','text/javascript']],['/a.css',['a','text/css']],['/b.css',['b','text/css']]]);
  const html='<head><link rel="manifest" href="/manifest"><link rel="stylesheet" href="/a.css"><script src="/a.js" defer></script><script src="/b.js" defer></script><style>.x{color:red}</style><link rel="stylesheet" href="/b.css"></head><body><script>window.inline=true</script></body>';
  const result=planPage(html,allowed);
  assert.deepEqual(result.groups.get('/client.js'),['/a.js','/b.js']);
  assert.deepEqual(result.groups.get('/client-core.css'),['/a.css']);assert.deepEqual(result.groups.get('/client-ui.css'),['/b.css']);
  assert.ok(result.page.indexOf('/client-core.css')<result.page.indexOf('<style>'));
  assert.ok(result.page.indexOf('/client-ui.css')>result.page.indexOf('</style>'));
  assert.equal((result.page.match(/<script src=/g)||[]).length,1);assert.match(result.page,/rel="manifest"/);assert.match(result.page,/window.inline=true/);
});

test('cached compressed bundles invalidate when a constituent changes without reordering scripts',async()=>{
  const allowed=new Map([['/a.js',['a','text/javascript']],['/b.js',['b','text/javascript']]]),sources=new Map([
    ['/index.html',{etag:'page',body:Buffer.from('<head><script src="/a.js" defer></script><script src="/b.js" defer></script></head>')}],
    ['/a.js',{etag:'a',body:Buffer.from('window.order=["a"]')}],['/b.js',{etag:'b',body:Buffer.from('window.order.push("b")')}]
  ]),bundles=createAssetBundles({allowed,read:async url=>sources.get(url)});
  const plain=await bundles.get('/client.js'),compressed=await bundles.get('/client.js','gzip');
  assert.deepEqual(gunzipSync(compressed.body),plain.body);assert.notEqual(compressed.etag,plain.etag);assert.match(plain.body.toString(),/\["a"\][\s\S]*push\("b"\)/);
  assert.equal((await bundles.get('/client.js','gzip')).body,compressed.body,'gzip work is shared');
  sources.set('/b.js',{etag:'changed',body:Buffer.from('window.order.push("c")')});
  const updated=await bundles.get('/client.js','gzip');assert.notEqual(updated.etag,compressed.etag);assert.match(gunzipSync(updated.body).toString(),/push\("c"\)/);
});
