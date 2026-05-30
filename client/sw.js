// практика 15
const APP_CACHE = 'app-shell-v15';
// практика 15. отдельный кэш для динамических страниц
const PAGE_CACHE = 'dynamic-content-v15';

// кэшируем html, css, js, manifest, иконки и картинки
const FILES = [
  '/',
  '/index.html',
  '/style.css?v=15',
  '/app.js?v=15',
  '/socket.io/socket.io.js',
  '/manifest.json?v=11',
  '/content/home.html?v=15',
  '/content/about.html?v=15',
  '/icons/icon-64.png?v=11',
  '/icons/icon-128.png?v=11',
  '/icons/icon-192.png?v=11',
  '/icons/icon-512.png?v=11',
  '/assets/images/1.png',
  '/assets/images/2.png'
];

// практика 13. install (статические файлы)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

// activate (удаляем старые кэши)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => ![APP_CACHE, PAGE_CACHE].includes(key))
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// fetch (перехватываем запросы страницы)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // практика 15 (чужие домены и POST запросы не кэшируем)
  if (url.origin !== location.origin || e.request.method !== 'GET') {
    return;
  }

  // Network First
  if (url.pathname.startsWith('/content/')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // для оболочки сначала кэш, потом сеть
  e.respondWith(
    caches.match(e.request).then(saved => saved || fetch(e.request))
  );
});

function networkFirst(req) {
  return fetch(req)
    .then(networkRes => {
      // кэшируем свежий ответ
      const resClone = networkRes.clone();
      caches.open(PAGE_CACHE).then(cache => {
        cache.put(req, resClone);
      });
      return networkRes;
    })
    .catch(() => {
      // если сеть недоступна, берем из кэша
      return caches.match(req)
        .then(cached => cached || caches.match('/content/home.html?v=15'));
    });
}

// практика 16. push
self.addEventListener('push', e => {
  let data = { title: 'Новое уведомление', body: '', reminderId: null };

  if (e.data) {
    data = e.data.json();
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-128.png',
    badge: '/icons/icon-64.png',
    // практика 17. кнопка отложить
    data: { reminderId: data.reminderId }
  };

  // если напоминание
  if (data.reminderId) {
    options.actions = [
      { action: 'snooze', title: 'Отложить на 5 минут' }
    ];
  }

  e.waitUntil(self.registration.showNotification(data.title, options));
});

// практика 17. обрабатываем кнопку отложить на 5 минут
self.addEventListener('notificationclick', e => {
  const id = e.notification.data && e.notification.data.reminderId;

  if (e.action === 'snooze' && id) {
    e.waitUntil(
      fetch(`/snooze?reminderId=${id}`, { method: 'POST' })
        .finally(() => e.notification.close())
    );
    return;
  }

  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
