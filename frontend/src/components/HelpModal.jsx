import React, { useState } from 'react';
import styles from './HelpModal.module.css';

const SHORTCUTS = [
  { tool: 'Paint Bucket', key: 'B' },
  { tool: 'Eyedropper', key: 'I' },
  { tool: 'Eraser', key: 'E' },
  { tool: 'Hand Tool', key: 'H' },
  { tool: 'Undo', key: 'Ctrl+Z' },
  { tool: 'Redo', key: 'Ctrl+Shift+Z' },
  { tool: 'Save', key: 'Ctrl+S' },
];

const FAQS = [
  { q: 'How do I save my design?', a: 'Click the Save button or press Ctrl+S. Guest users must sign in to save.' },
  { q: 'How do I submit a work order?', a: 'Fill at least 50% of regions, then click Submit Work Order.' },
  { q: 'Can I use custom colors?', a: 'Yes, use the Color Picker to select any color.' },
  { q: 'How do I change glass types?', a: 'Select a region, then choose a glass type from the selector.' },
];

export default function HelpModal({ open, onClose, onReplayTutorial }) {
  const [openFaq, setOpenFaq] = useState(null);
  if (!open) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2>Quick Start Guide</h2>
        <div className={styles.guide}>
          <img src="/guide1.png" alt="Step 1" />
          <img src="/guide2.png" alt="Step 2" />
          <img src="/guide3.png" alt="Step 3" />
        </div>
        <h3>Keyboard Shortcuts</h3>
        <table className={styles.shortcuts}>
          <thead><tr><th>Tool</th><th>Shortcut</th></tr></thead>
          <tbody>
            {SHORTCUTS.map(s => <tr key={s.tool}><td>{s.tool}</td><td>{s.key}</td></tr>)}
          </tbody>
        </table>
        <h3>FAQ</h3>
        <div className={styles.faqs}>
          {FAQS.map((f, idx) => (
            <div key={f.q} className={styles.faq}>
              <button className={styles.faqBtn} onClick={() => setOpenFaq(openFaq === idx ? null : idx)}>{f.q}</button>
              {openFaq === idx && <div className={styles.faqA}>{f.a}</div>}
            </div>
          ))}
        </div>
        <button className={styles.replayBtn} onClick={onReplayTutorial}>Replay Tutorial</button>
        <a className={styles.support} href="mailto:customersupport@sgcgart.com">Contact Support</a>
      </div>
    </div>
  );
}
