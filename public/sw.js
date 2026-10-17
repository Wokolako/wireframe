const SHELL='wirefen-shell-v11';
const CATALOG='wirefen-public-v4';
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(SHELL);const response=await fetch('/',{cache:'reload'});if(!response.ok)throw new Error('App shell unavailable');const html=await response.clone().text();await cache.put('/',response);const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)].map(match=>match[1]);await cache.addAll(['/icon.svg','/manifest.webmanifest',...assets]);})());self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wirefen-')&&![SHELL,CATALOG].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin)return;
 // Only public listings may enter the API cache. Sessions, farms, and orders never do.
 if(url.pathname.startsWith('/api/')){
  if(url.pathname==='/api/v1/listings'&&!url.searchParams.has('mine'))event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CATALOG).then(c=>c.put(event.request,copy)));}return response;}).catch(async()=>await caches.match(event.request)||new Response(JSON.stringify({error:'This catalogue view is not available offline yet.'}),{status:503,headers:{'Content-Type':'application/json'}})));
  return;
 }
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/')));return;}
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(SHELL).then(cache=>cache.put(event.request,copy)));}return response;})));
});
