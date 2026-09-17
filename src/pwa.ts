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

function alreadyInstalled(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    // iOS Safari (no beforeinstallprompt there).
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
  } catch {
    /* matchMedia unavailable — fall through */
  }
  return false;
}

function installInstructions(): string {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  if (isIOS) return 'To install: Share → Add to Home Screen (iOS Safari).';
  if (isAndroid) return 'To install: browser menu ⋮ → Add to Home screen / Install app.';
  return 'To install: browser menu → Install / Add to Home screen (needs HTTPS or localhost).';
}

/**
 * Custom-install-button pattern:
 * - `preventDefault()` on beforeinstallprompt intentionally suppresses the
 *   automatic mini-banner — that DevTools message
 *   ("Banner not shown: beforeinstallpromptevent.preventDefault() called…")
 *   is expected, not a bug.
 * - We then call `prompt()` on the user's Install click below, which is
 *   the only way Chrome allows showing the banner after preventDefault.
 */
export function wireInstall(button: HTMLButtonElement, hint?: HTMLElement | null): void {
  if (alreadyInstalled()) {
    button.hidden = true;
    return;
  }
  let deferred: Event | null = null;
  const showHint = (msg: string) => {
    if (hint) {
      hint.hidden = false;
      hint.textContent = msg;
    } else {
      window.alert(msg);
    }
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    button.hidden = false;
    if (hint) hint.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
    if (hint) hint.hidden = true;
  });
  button.addEventListener('click', () => {
    if (!deferred) {
      // Event hasn't fired (iOS, already-installed, or non-Chromium):
      // fall back to manual instructions instead of staying silent.
      showHint(installInstructions());
      return;
    }
    const ev = deferred as unknown as { prompt: () => void; userChoice: Promise<unknown> };
    ev.prompt();
    void ev.userChoice
      .catch(() => undefined)
      .finally(() => {
        deferred = null;
        button.hidden = true;
      });
  });
}
