import React, { useState } from 'react';
import { colorPalettes } from '../data/colorPalettes';
import styles from './ColorPalettes.module.css';

const paletteNames = Object.keys(colorPalettes);

export default function ColorPalettes({ onSelectColor }) {
  const [selectedPalette, setSelectedPalette] = useState(paletteNames[0]);

  return (
    <div className={styles.paletteContainer}>
      <div className={styles.paletteTabs} role="tablist">
        {paletteNames.map((name) => (
          <button
            key={name}
            className={
              name === selectedPalette
                ? `${styles.tab} ${styles.selected}`
                : styles.tab
            }
            onClick={() => setSelectedPalette(name)}
            role="tab"
            aria-selected={name === selectedPalette}
            tabIndex={0}
          >
            {name}
          </button>
        ))}
      </div>
      <div className={styles.swatchGrid}>
        {colorPalettes[selectedPalette].map((color) => (
          <button
            key={color.hex}
            className={styles.swatch}
            style={{ background: color.hex }}
            onClick={() => onSelectColor && onSelectColor(color.hex)}
            title={color.name}
            aria-label={color.name}
            tabIndex={0}
          >
            <span className={styles.swatchLabel}>{color.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
