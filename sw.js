/* 노회 문서 앱 전용 서비스 워커
   이 사이트(https://aichurchsystem.github.io/certificate/) 범위만 담당한다.
   운동일지 앱(/Church/)과는 다른 사이트이므로 그쪽 캐시·화면은 건드리지 않는다.
   네트워크가 있으면 새 파일을 먼저 받아 두고, 없으면 받아 둔 사본으로 연다. */

const CACHE = 'certificate-standalone-v81';
const SHELL = [
  './',
  './index.html',
  './assets/app.css?v=62',
  './assets/app.js?v=62',
  './assets/notice.js?v=62',
  './assets/lock.js?v=62',
  './assets/xlsx.js?v=62',
  './assets/fonts/nm-Regular.woff2',
  './assets/fonts/nm-Bold.woff2',
  './assets/logo-sky.svg',
  './assets/logo-white.svg',
  './assets/logo-deep.svg',
  './assets/logo-navy.svg',
  './assets/seals/seal-chair-round.png',
  './assets/seals/seal-secretary-round.png',
  './assets/seals/seal-presbytery-square.png',
  './assets/seals/seal-blind-emboss.png',
  './assets/band.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon-180.png',
  './data/people.json',
  './data/types.json',
  './data/config.json',
  './data/명단-샘플.xlsx',
  './manifest.webmanifest',
  './vendor/html2canvas.min.js',
  './vendor/qrcode.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) =>
        c.add(new Request(u, { cache: 'reload' })).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        // 같은 origin(운동일지 앱)의 캐시는 건드리지 않고, 이 앱의 옛 캐시만 지운다
        .filter((k) => k !== CACHE && k.startsWith('certificate-'))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;   // 예: /certificate/
  if (!url.pathname.startsWith(scopePath)) return;                // 폴더 밖 요청은 그대로 둔다

  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(
        (hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
      ))
  );
});
