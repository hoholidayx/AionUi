const CACHE_NAME = 'aionui-webui-v3';
const NON_CACHEABLE_PATHS = new Set(['/qr-login']);
const OFFLINE_PAGE_URL = new URL('./index.html', self.location.href).toString();
const PRECACHE_URLS = [
  new URL('./', self.location.href).toString(),
  OFFLINE_PAGE_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./pwa/icon-192.png', self.location.href).toString(),
  new URL('./pwa/icon-512.png', self.location.href).toString(),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all(['aionui-webui-v1', 'aionui-webui-v2'].map((key) => caches.delete(key))).then(() =>
      self.clients.claim()
    )
  );
});

function shouldHandleRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  return !url.pathname.startsWith('/api/') && !NON_CACHEABLE_PATHS.has(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Only fall back to the offline index.html for navigation requests.
    // Returning index.html for a `<script>` request gives the browser HTML with
    // a text/html MIME and breaks the page with "module script MIME" errors.
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await cache.match(OFFLINE_PAGE_URL)) || Response.error();
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkFetch;
    return cached;
  }

  return (await networkFetch) || Response.error();
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // The HTTP cache handles hashed assets. Keeping a second copy here
  // would retain old bundles across deployments.
  const assetPath = new URL('./assets/', self.location.href).pathname;
  if (new URL(event.request.url).pathname.startsWith(assetPath)) return;

  if (['image', 'font'].includes(event.request.destination)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
