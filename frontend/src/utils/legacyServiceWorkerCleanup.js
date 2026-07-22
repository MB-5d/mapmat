export function clearLegacyServiceWorkers() {
  if (typeof window === 'undefined') return;

  const clearCaches = async () => {
    if (!('caches' in window)) return;
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
  };

  const cleanup = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      }
      await clearCaches();
    } catch (error) {
      console.warn('Failed to clear legacy service worker cache', error);
    }
  };

  if (document.readyState === 'complete') {
    cleanup();
  } else {
    window.addEventListener('load', cleanup, { once: true });
  }
}
