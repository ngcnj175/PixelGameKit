const CACHE_NAME = 'pixelgamekit-v1.57.2';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/utils/storage.js',
    './js/utils/share.js',
    './js/editor/sprite-editor.js',
    './js/editor/stage-editor.js',
    './js/editor/bgm-editor.js',
    './js/engine/audio.js',
    './js/engine/game-engine.js',
    './js/engine/player.js',
    './js/engine/enemy.js',
    './js/ui/controller.js',
    './js/ui/toolbar.js',
    './manifest.json'
];

// インストール
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// アクティベート
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// フェッチ
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
