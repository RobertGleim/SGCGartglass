import { useEffect, useState } from 'react';

/**
 * Captures the browser's `beforeinstallprompt` event so multiple components
 * can trigger the native PWA install dialog without duplicating event listeners.
 * The captured prompt is stored on `window.__pwaPrompt` so any component can
 * read it synchronously (e.g. after the initial render).
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(() => window.__pwaPrompt || null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      window.__pwaPrompt = e;
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = async () => {
    const p = window.__pwaPrompt;
    if (!p) return false;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') {
      window.__pwaPrompt = null;
      setPrompt(null);
    }
    return outcome === 'accepted';
  };

  return { prompt, triggerInstall };
}
