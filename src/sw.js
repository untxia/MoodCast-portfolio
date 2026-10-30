const CACHE_NAME = 'moodcast-v5';
const EMOJI = [/*EMOJI_LIST*/]; // rempli au build (scripts/build.mjs)
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './app.css',
  './meteo.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  ...EMOJI.map(n => './emoji/' + n + '.webp')
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
  // Laisse passer les appels non-GET et la fonction IA (jamais mis en cache)
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/.netlify/')) return;
  // Réseau d'abord (toujours la dernière version), cache en secours hors-ligne
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && new URL(event.request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
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
