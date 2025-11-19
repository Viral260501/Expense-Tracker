const CACHE = 'expense-manager-v1';
const ASSETS = [
  '/frontend/index.html',
  '/frontend/signup.html',
  '/frontend/forgot.html',
  '/frontend/dashboard-employee.html',
  '/frontend/dashboard-manager.html',
  '/frontend/assets/css/styles.css',
  '/frontend/assets/js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
