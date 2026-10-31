'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Elleson Connect is displayed across Android, Windows, web and the included keyboard',()=>{
 for(const name of ['index.html','public/mission-control.js','public/sw.js','public/google-signin.js','android/src/main/AndroidManifest.xml','android/src/main/res/layout/activity_main.xml','HostTray/Program.cs','installer/PCRemote.iss'])assert.ok(read(name).includes('Elleson Connect'),name);
 assert.ok(read('android/src/main/AndroidManifest.xml').includes('Elleson Keyboard · Elleson Connect'));
 assert.ok(read('android/src/main/java/za/co/pcremote/controller/keyboard/SerameKeyboardService.kt').includes('brand.text = "Elleson"'));
});
test('rebranding keeps upgrade, session, discovery and keyboard identities compatible',()=>{
 assert.ok(read('android/build.gradle.kts').includes('applicationId = "za.co.pcremote.controller"'));
 assert.ok(read('android/src/main/AndroidManifest.xml').includes('.keyboard.SerameKeyboardService'));
 assert.ok(read('HostTray/Program.cs').includes('Local\\\\PCRemotePersonalHost'));
 assert.ok(read('installer/PCRemote.iss').includes('C9EF8E11-66AA-43CB-B017-25F799BDA175'));
 assert.ok(read('local-discovery.js').includes("type:'pcremote'"));
 assert.ok(read('sync-hub.js').includes("identity='PC Remote'"));
 assert.ok(read('.github/workflows/android-apk.yml').includes('1803b0080ad05d54df52de3a61fa4a9978244ca51e9df842d0303d42636c11eb'));
});
test('versioned updates and new icons cover web, adaptive Android launchers and Windows',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'2.3.2');
 assert.ok(read('android/build.gradle.kts').includes('versionCode = 25'));
 assert.ok(read('HostTray/HostTray.csproj').includes('<Product>Elleson Connect</Product>'));
 for(const [name,size]of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]){const bytes=fs.readFileSync(path.join(root,'public',name));assert.equal(bytes.toString('ascii',1,4),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
 const ico=fs.readFileSync(path.join(root,'HostTray/Assets/remote.ico'));assert.equal(ico.readUInt16LE(2),1);assert.ok(ico.readUInt16LE(4)>=7);
 for(const name of ['ic_launcher','ic_launcher_round'])assert.ok(read('android/src/main/res/mipmap-anydpi-v26/'+name+'.xml').includes('<adaptive-icon'));
});
