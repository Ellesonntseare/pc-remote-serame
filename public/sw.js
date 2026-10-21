'use strict';
// Remote control is online-only. Never cache paired pages, sessions, API data,
// screen frames, or input requests. Every live request goes to the host.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate'||event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).catch(()=>new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PC Remote is offline</title><style>body{background:#07090f;color:#eef3ff;font:16px/1.6 system-ui;padding:12vh 24px;max-width:420px;margin:auto}a{color:#9cb5ff}</style><h1>PC Remote is offline</h1><p>Reconnect your phone to the internet and keep the Windows host running, then try again.</p><a href="/">Try again</a></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )));
});
