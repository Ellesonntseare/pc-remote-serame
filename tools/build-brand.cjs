'use strict';
// The EC artwork is drawn as vectors, then exported from the same geometry.
// Regenerate: node tools/build-brand.cjs <directory containing sharp>
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const sharp=require(require.resolve('sharp',{paths:[process.argv[2]||root]}));
const put=(name,data)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
const strokes=(mono=false)=>`<g fill="none" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M28 18H19a4 4 0 0 0-4 4v20a4 4 0 0 0 4 4h9M15 32h13" stroke="${mono?'currentColor':'#48DFC5'}"/><path d="M49 20h-8a10 10 0 0 0-10 10v4a10 10 0 0 0 10 10h8" stroke="${mono?'currentColor':'#69BCFF'}"/><path d="M26 32h11" stroke="${mono?'currentColor':'#A5F1E8'}"/></g>`;
const tile=`<rect x="1" y="1" width="62" height="62" rx="17" fill="#081C28" stroke="#294A59"/>`;
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Elleson Connect">${body}</svg>\n`;
const icon=svg(tile+strokes());
put('public/brand.svg',icon);
put('public/branding/elleson-connect-mark.svg',svg(strokes()));
put('public/branding/elleson-connect-mono.svg',svg(strokes(true)));
for(const [mode,color]of [['dark','#E9F4FA'],['light','#102D3B']]){
 const wordmark=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 96" role="img" aria-label="Elleson Connect"><g transform="translate(0 16)">${tile}${strokes()}</g><text x="84" y="45" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="34" font-weight="650" letter-spacing="-1">Elleson</text><text x="85" y="71" fill="${mode==='dark'?'#9EBCCB':'#436475'}" font-family="Segoe UI,Arial,sans-serif" font-size="17" font-weight="600" letter-spacing="4">CONNECT</text></svg>\n`;
 put(`public/branding/elleson-connect-wordmark-${mode}.svg`,wordmark);
}
(async()=>{
 for(const [name,size]of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]])await sharp(Buffer.from(icon)).resize(size,size).png().toFile(path.join(root,'public',name));
 const mask=svg('<rect width="64" height="64" fill="#081C28"/>'+`<g transform="translate(8 8) scale(.75)">${strokes()}</g>`);
 await sharp(Buffer.from(mask)).resize(512,512).png().toFile(path.join(root,'public/icon-maskable-512.png'));
 await sharp(Buffer.from(icon)).resize(1024,1024).png().toFile(path.join(root,'public/branding/elleson-connect-icon.png'));
 const icoSizes=[16,20,24,32,40,48,64,128,256],icoImages=[];
 for(const size of icoSizes)icoImages.push(await sharp(Buffer.from(icon)).resize(size,size).png().toBuffer());
 const icoHeader=Buffer.alloc(6+16*icoSizes.length);icoHeader.writeUInt16LE(1,2);icoHeader.writeUInt16LE(icoSizes.length,4);let offset=icoHeader.length;
 icoImages.forEach((bytes,index)=>{const pos=6+16*index,size=icoSizes[index];icoHeader[pos]=icoHeader[pos+1]=size===256?0:size;icoHeader.writeUInt16LE(1,pos+4);icoHeader.writeUInt16LE(32,pos+6);icoHeader.writeUInt32LE(bytes.length,pos+8);icoHeader.writeUInt32LE(offset,pos+12);offset+=bytes.length;});
 put('HostTray/Assets/remote.ico',Buffer.concat([icoHeader,...icoImages]));
 const preview=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650" viewBox="0 0 1200 650"><rect width="1200" height="650" fill="#07151F"/><text x="64" y="66" fill="#9CB7C7" font-size="16" font-family="Segoe UI,Arial,sans-serif" letter-spacing="3">ELLESON CONNECT / BRAND IDENTITY</text><g transform="translate(64 125) scale(4.8)">${tile}${strokes()}</g><text x="435" y="230" fill="#EFF8FC" font-size="76" font-weight="650" font-family="Segoe UI,Arial,sans-serif" letter-spacing="-3">Elleson</text><text x="440" y="291" fill="#9DBACB" font-size="35" font-family="Segoe UI,Arial,sans-serif" letter-spacing="9">CONNECT</text><text x="440" y="365" fill="#B7CCD7" font-size="23" font-family="Segoe UI,Arial,sans-serif">Your devices, together.</text><path d="M64 478h1072" stroke="#294553"/><text x="64" y="526" fill="#8FAFBE" font-size="16" font-family="Segoe UI,Arial,sans-serif">ONE MARK. EVERY SCREEN.</text>${[32,48,64].map((s,i)=>`<g transform="translate(${64+i*105} 550) scale(${s/64})">${tile}${strokes()}</g>`).join('')}<rect x="860" y="529" width="48" height="48" rx="12" fill="#48DFC5"/><rect x="928" y="529" width="48" height="48" rx="12" fill="#69BCFF"/><rect x="996" y="529" width="48" height="48" rx="12" fill="#A5F1E8"/><rect x="1064" y="529" width="48" height="48" rx="12" fill="#081C28" stroke="#294A59"/></svg>`;
 await sharp(Buffer.from(preview)).png().toFile(path.join(root,'public/branding/elleson-connect-preview.png'));
 const vector=`<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="64dp" android:height="64dp" android:viewportWidth="64" android:viewportHeight="64"><path android:fillColor="#081C28" android:pathData="M0,0h64v64h-64z"/><path android:fillColor="#00000000" android:strokeColor="#48DFC5" android:strokeWidth="5.5" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M28,18H19a4,4 0,0 0,-4,4v20a4,4 0,0 0,4,4h9 M15,32h13"/><path android:fillColor="#00000000" android:strokeColor="#69BCFF" android:strokeWidth="5.5" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M49,20h-8a10,10 0,0 0,-10,10v4a10,10 0,0 0,10,10h8"/><path android:fillColor="#00000000" android:strokeColor="#A5F1E8" android:strokeWidth="5.5" android:strokeLineCap="round" android:pathData="M26,32h11"/></vector>\n`;
 put('android/src/main/res/drawable/ic_remote.xml',vector);
 put('android/src/main/res/drawable/ic_notification.xml',vector.replace('<path android:fillColor="#081C28" android:pathData="M0,0h64v64h-64z"/>','').replaceAll('#48DFC5','#FFFFFF').replaceAll('#69BCFF','#FFFFFF').replaceAll('#A5F1E8','#FFFFFF'));
 // Adaptive icons place all strokes in the central safe zone of the 108dp canvas.
 put('android/src/main/res/drawable/ic_launcher_foreground.xml',vector.replaceAll('64dp','108dp').replaceAll('viewportWidth="64"','viewportWidth="108"').replaceAll('viewportHeight="64"','viewportHeight="108"').replace('<path android:fillColor="#081C28" android:pathData="M0,0h64v64h-64z"/>','<group android:translateX="22" android:translateY="22">').replace('</vector>','</group></vector>'));
 const adaptive=`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/brand_background"/><foreground android:drawable="@drawable/ic_launcher_foreground"/><monochrome android:drawable="@drawable/ic_launcher_foreground"/></adaptive-icon>\n`;
 put('android/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',adaptive);
 put('android/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',adaptive);
 put('android/src/main/res/values/brand_colors.xml','<resources><color name="brand_background">#081C28</color></resources>\n');
 console.log('Created SVG logo family, raster web icons, Android adaptive icons and brand preview.');
})().catch(error=>{console.error(error);process.exitCode=1});
