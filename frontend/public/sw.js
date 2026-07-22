self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    const clients = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    await Promise.all(clients.map((client) => client.navigate(client.url)));
  })());
});
