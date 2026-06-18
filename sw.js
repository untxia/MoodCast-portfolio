const CACHE_NAME = 'moodcast-v1';
const ASSETS = [
  './',
  './index.html',
  './meteo.css',
  './meteo.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// INSTALLATION
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATION
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// FETCH — mode hors ligne
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// CLIC SUR NOTIFICATION — rouvre l'appli
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow('./index.html');
    })
  );
});

// MESSAGE — reçoit l'ordre de programmer / annuler une notification
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_NOTIF') {
    const { hour, minute } = event.data;
    scheduleDaily(hour, minute);
  }
  if (event.data?.type === 'CANCEL_NOTIF') {
    if (self._notifTimeout) clearTimeout(self._notifTimeout);
  }
});

// PROGRAMMER LA NOTIFICATION QUOTIDIENNE
function scheduleDaily(hour, minute) {
  if (self._notifTimeout) clearTimeout(self._notifTimeout);

  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);

  // Si l'heure est déjà passée aujourd'hui → demain
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;

  self._notifTimeout = setTimeout(() => {
    self.registration.showNotification('MoodCast 🌿', {
      body: "Comment tu te sens aujourd'hui ? Enregistre ta météo intérieure.",
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'moodcast-daily',
      renotify: true
    });
    // Reprogrammer pour le lendemain
    scheduleDaily(hour, minute);
  }, delay);
}
