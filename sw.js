self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

const timers = {};

self.addEventListener('message', e => {
  const { type, id, title, body, ms } = e.data;
  if(type === 'SCHEDULE') {
    if(timers[id]) clearTimeout(timers[id]);
    if(ms <= 0) return;
    timers[id] = setTimeout(() => {
      self.registration.showNotification('📅 ' + title, {
        body: body,
        icon: 'https://em-content.zobj.net/source/google/387/clipboard_1f4cb.png',
        tag: 'evt_' + id,
        requireInteraction: true
      });
    }, ms);
  }
  if(type === 'CANCEL') {
    if(timers[id]) { clearTimeout(timers[id]); delete timers[id]; }
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://superjeffz.github.io/Secret'));
});
