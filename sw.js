/* HugNa — service worker
 * VERSION ถูกแก้โดย scripts/bump-version.sh — เปลี่ยนเลขแล้วเบราว์เซอร์จะติดตั้ง SW ใหม่และล้างแคชเก่า */
const VERSION = '1.4.1';
const CACHE = 'hugna-' + VERSION;
const SHELL = ['./', 'index.html', 'icons/icon-192.png', 'img/logo.png', 'img/mascot.png', 'img/wordmark.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;              // ไม่แคช API (script.google.com) และ CDN
  if (url.pathname.endsWith('version.json')) return;       // ต้องสดเสมอ
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (isPage) {
    // หน้าเว็บ: เอาจากเน็ตก่อน (ได้เวอร์ชันใหม่ทันที) ถ้าออฟไลน์ค่อยใช้แคช
    e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./'))));
    return;
  }
  // ไฟล์ js/css/รูป มี ?v=<เวอร์ชัน> อยู่แล้ว → ใช้แคชก่อนได้
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
