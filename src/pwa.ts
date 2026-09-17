/** PWA wiring: service-worker registration + install prompt. */

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;
  // Only register production SW — in `vite dev` there is nothing to cache
  // and a stale worker would just confuse development.
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

export function wireInstall(button: HTMLButtonElement): void {
  let deferred: Event | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
  });
  button.addEventListener('click', () => {
    if (!deferred) return;
    const ev = deferred as unknown as { prompt: () => void; userChoice: Promise<unknown> };
    ev.prompt();
    void ev.userChoice.finally(() => {
      deferred = null;
      button.hidden = true;
    });
  });
}
