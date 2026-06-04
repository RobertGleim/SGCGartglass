import { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import styles from './AppDownloadSection.module.css';

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

function IOSInstructionsModal({ onClose }) {
  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="How to add to iPhone">
      <div className={styles.modal}>
        <button className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        <img src="/apple-touch-icon.png" alt="SGCG Art" className={styles.modalIcon} />
        <h2 className={styles.modalTitle}>Add to iPhone</h2>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepIcon}>1</span>
            Tap the <strong>Share</strong> button (
            <span className={styles.shareIcon} aria-label="share icon">⬆</span>)
            at the bottom of Safari
          </li>
          <li>
            <span className={styles.stepIcon}>2</span>
            Scroll down and tap{' '}
            <strong>"Add to Home Screen"</strong>
          </li>
          <li>
            <span className={styles.stepIcon}>3</span>
            Tap <strong>"Add"</strong> — done! SGCG Art will appear on your home screen.
          </li>
        </ol>
        <p className={styles.modalNote}>⚠️ Works in Safari only. If you're in another browser, open this page in Safari first.</p>
        <button className={styles.modalCta} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function AndroidInstructionsModal({ onClose }) {
  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="How to add to Android">
      <div className={styles.modal}>
        <button className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        <img src="/web-app-manifest-192x192.png" alt="SGCG Art" className={styles.modalIcon} />
        <h2 className={styles.modalTitle}>Add to Android</h2>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepIcon}>1</span>
            Tap the <strong>Menu</strong> button (
            <span className={styles.shareIcon} aria-label="menu icon">⋮</span>)
            in the top-right corner of Chrome
          </li>
          <li>
            <span className={styles.stepIcon}>2</span>
            Tap <strong>"Add to Home screen"</strong>
          </li>
          <li>
            <span className={styles.stepIcon}>3</span>
            Tap <strong>"Add"</strong> — SGCG Art will appear on your home screen.
          </li>
        </ol>
        <p className={styles.modalNote}>Works best in Chrome. Samsung Internet also supports this feature.</p>
        <button className={styles.modalCta} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

export default function AppDownloadSection({ variant = 'default' }) {
  const { prompt, triggerInstall } = useInstallPrompt();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showAndroidModal, setShowAndroidModal] = useState(false);

  const ios = isIOS();
  const android = isAndroid();

  const handleAndroid = async () => {
    if (prompt) {
      await triggerInstall();
    } else {
      setShowAndroidModal(true);
    }
  };

  const sectionClassName = [
    styles.section,
    variant === 'hero' ? styles.sectionHero : '',
    variant === 'heroCardBox' ? styles.sectionHeroCard : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {showIOSModal && <IOSInstructionsModal onClose={() => setShowIOSModal(false)} />}
      {showAndroidModal && <AndroidInstructionsModal onClose={() => setShowAndroidModal(false)} />}

      <section className={sectionClassName} aria-label="Download app">
        <div className={styles.inner}>
          <img src="/web-app-manifest-192x192.png" alt="SGCG Art app icon" className={styles.appIcon} />
          <div className={styles.copy}>
            <h2 className={styles.heading}>Shop from your phone</h2>
            <p className={styles.sub}>Add SGCG Art to your home screen for quick access — no app store needed.</p>
          </div>
          <div className={styles.buttons}>
            {/* Android button — shown to Android users or as fallback on desktop */}
            {!ios && (
              <button
                className={`${styles.btn} ${styles.androidBtn}`}
                onClick={handleAndroid}
                aria-label="Add to Android home screen"
              >
                <svg className={styles.btnIcon} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M6.18 15.64a2.18 2.18 0 1 0 2.18 2.18 2.18 2.18 0 0 0-2.18-2.18zm11.64 0a2.18 2.18 0 1 0 2.18 2.18 2.18 2.18 0 0 0-2.18-2.18zm.47-9.64H5.71a.93.93 0 0 0-.93.93V14a.93.93 0 0 0 .93.93h12.58a.93.93 0 0 0 .93-.93V6.93a.93.93 0 0 0-.93-.93zM2.64 5.36A1.79 1.79 0 0 0 .85 7.15v7.7a1.79 1.79 0 0 0 1.79 1.79H3V5.36zm18.72 0v11.28h.36a1.79 1.79 0 0 0 1.79-1.79V7.15a1.79 1.79 0 0 0-1.79-1.79z"/>
                </svg>
                Add to Android
              </button>
            )}

            {/* iOS button — shown to iPhone/iPad users or as fallback on desktop */}
            {!android && (
              <button
                className={`${styles.btn} ${styles.iosBtn}`}
                onClick={() => setShowIOSModal(true)}
                aria-label="Add to iPhone home screen"
              >
                <svg className={styles.btnIcon} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Add to iPhone
              </button>
            )}

            {/* Show both on desktop so users can share the instructions */}
            {!ios && !android && null}
          </div>

          {/* QR code — only shown on desktop where scanning makes sense */}
          <div className={styles.qrWrap}>
            <img src="/qrblack2.png" alt="Scan to open SGCG Art on your phone" className={styles.qrCode} />
            <p className={styles.qrLabel}>Scan to open on your phone</p>
          </div>
        </div>
      </section>
    </>
  );
}
