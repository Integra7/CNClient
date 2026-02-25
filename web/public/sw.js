self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'showNotification' && event.data.title) {
    const opts = { body: event.data.body || '' };
    self.registration.showNotification(event.data.title, opts);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) list[0].focus();
      else if (clients.openWindow) clients.openWindow(self.registration.scope);
    })
  );
});
