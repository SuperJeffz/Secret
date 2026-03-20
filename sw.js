self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  self.registration.showNotification(d.title||'เลขาส่วนตัว', {
    body: d.body||'',
    icon: 'https://em-content.zobj.net/source/google/387/clipboard_1f4cb.png',
    badge: 'https://em-content.zobj.net/source/google/387/clipboard_1f4cb.png'
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://superjeffz.github.io/Secret'));
});
