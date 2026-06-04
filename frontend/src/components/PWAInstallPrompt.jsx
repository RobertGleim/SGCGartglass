import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import styles from './PWAInstallPrompt.module.css';

export default function PWAInstallPrompt() {
  const { prompt, triggerInstall } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prompt) setVisible(true);
  }, [prompt]);

  const handleInstall = async () => {
    const accepted = await triggerInstall();
    if (accepted) setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className={styles.banner} role="dialog" aria-label="Install app">
      <div className={styles.content}>
        <img src="/web-app-manifest-192x192.png" alt="SGCG Art" className={styles.icon} />
        <div className={styles.text}>
          <strong>Add SGCG Art to your phone</strong>
          <span>Shop and browse like a native app</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.installBtn} onClick={handleInstall}>Install</button>
        <button className={styles.dismissBtn} onClick={handleDismiss} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
