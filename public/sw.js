// Auri Service Worker for Native Android & Windows Push / Local Notifications
const CACHE_NAME = 'auri-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle notification click: bring window to focus or open chat
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (conversationId) {
            client.postMessage({ type: 'NAVIGATE_CONVERSATION', conversationId });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(conversationId ? `/?chat=${conversationId}` : '/');
      }
    })
  );
});
