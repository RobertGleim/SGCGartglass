import React, { useState, useRef } from 'react';
import styles from './BottomSheet.module.css';

export default function BottomSheet({ open, onClose, children }) {
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef();

  // Swipe gesture
  let startY = null;
  const handleTouchStart = (e) => {
    startY = e.touches[0].clientY;
  };
  const handleTouchMove = (e) => {
    if (!startY) return;
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY < -40) setExpanded(true);
    if (deltaY > 40) setExpanded(false);
  };
  const handleTouchEnd = () => { startY = null; };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={expanded ? styles.sheetExpanded : styles.sheet}
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.handle} onClick={() => setExpanded(!expanded)} />
        <div className={styles.sections}>{children}</div>
      </div>
    </div>
  );
}
