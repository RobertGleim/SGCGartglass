import React, { useRef } from 'react';
import useColorPicker from '../hooks/useColorPicker';
import styles from './ColorPicker.module.css';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function validateHex(hex) {
  return /^#([A-Fa-f0-9]{6})$/.test(hex);
}

export default function ColorPicker() {
  const {
    currentColor,
    setCurrentColor,
    recentColors,
    addToRecentColors,
    rgbToHex,
    hexToRgb,
  } = useColorPicker();

  // RGB slider/input handlers
  const handleRgbChange = (channel, value) => {
    value = clamp(Number(value), 0, 255);
    setCurrentColor((color) => ({ ...color, [channel]: value }));
  };

  // Hex input handler
  const handleHexChange = (e) => {
    const hex = e.target.value.toUpperCase();
    setCurrentColor((color) => ({ ...color, hex }));
  };

  const handleHexBlur = () => {
    if (!validateHex(currentColor.hex)) {
      setCurrentColor((color) => ({ ...color, hex: rgbToHex(color.r, color.g, color.b) }));
    }
  };

  // Visual picker (hue/sat/bright)
  const hueSatRef = useRef(null);
  // removed unused brightnessRef

  // Hue/Sat square
  const handleHueSatClick = (e) => {
    const rect = hueSatRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    const hue = (x / rect.width) * 360;
    const sat = (y / rect.height) * 100;
    // Convert HSV to RGB
    const bright = 100;
    const rgb = hsvToRgb(hue, sat, bright);
    setCurrentColor(rgb);
  };

  // Brightness slider
  const handleBrightnessChange = (e) => {
    const bright = clamp(Number(e.target.value), 0, 100);
    // Use current hue/sat
    const { r, g, b } = currentColor;
    const { h, s } = rgbToHsv(r, g, b);
    const rgb = hsvToRgb(h, s, bright);
    setCurrentColor(rgb);
  };

  // HSV <-> RGB conversion
  function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    let c = v * s;
    let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) h = 0;
    else {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
    }
    return { h, s: s * 100, v: v * 100 };
  }

  // Add to recent colors
  const handleAddRecent = () => {
    addToRecentColors(currentColor.hex);
  };

  // Recent color click
  const handleRecentClick = (hex) => {
    const rgb = hexToRgb(hex);
    if (rgb) setCurrentColor({ ...rgb, hex });
  };

  // Accessibility: ARIA labels, keyboard navigation
  // All inputs have aria-label, tabIndex

  return (
    <div className={styles.picker}>
      <div className={styles.preview} style={{ background: currentColor.hex }} aria-label="Color preview" tabIndex={0} />
      <div className={styles.inputs}>
        <div className={styles.rgbInputs}>
          <label>
            R
            <input
              type="range"
              min="0"
              max="255"
              value={currentColor.r}
              onChange={(e) => handleRgbChange('r', e.target.value)}
              aria-label="Red slider"
              tabIndex={0}
            />
            <input
              type="number"
              min="0"
              max="255"
              value={currentColor.r}
              onChange={(e) => handleRgbChange('r', e.target.value)}
              aria-label="Red value"
              tabIndex={0}
            />
          </label>
          <label>
            G
            <input
              type="range"
              min="0"
              max="255"
              value={currentColor.g}
              onChange={(e) => handleRgbChange('g', e.target.value)}
              aria-label="Green slider"
              tabIndex={0}
            />
            <input
              type="number"
              min="0"
              max="255"
              value={currentColor.g}
              onChange={(e) => handleRgbChange('g', e.target.value)}
              aria-label="Green value"
              tabIndex={0}
            />
          </label>
          <label>
            B
            <input
              type="range"
              min="0"
              max="255"
              value={currentColor.b}
              onChange={(e) => handleRgbChange('b', e.target.value)}
              aria-label="Blue slider"
              tabIndex={0}
            />
            <input
              type="number"
              min="0"
              max="255"
              value={currentColor.b}
              onChange={(e) => handleRgbChange('b', e.target.value)}
              aria-label="Blue value"
              tabIndex={0}
            />
          </label>
        </div>
        <div className={styles.hexInput}>
          <label>
            Hex
            <input
              type="text"
              value={currentColor.hex}
              onChange={handleHexChange}
              onBlur={handleHexBlur}
              aria-label="Hex color input"
              tabIndex={0}
              maxLength={7}
              pattern="#([A-Fa-f0-9]{6})"
            />
          </label>
        </div>
      </div>
      <div
        className={styles.hueSat}
        ref={hueSatRef}
        onClick={handleHueSatClick}
        aria-label="Hue/Saturation picker"
        tabIndex={0}
      >
        {/* Visual picker square, rendered with CSS background */}
      </div>
      <div className={styles.brightness}>
        <label>
          Brightness
          <input
            type="range"
            min="0"
            max="100"
            value={rgbToHsv(currentColor.r, currentColor.g, currentColor.b).v}
            onChange={handleBrightnessChange}
            aria-label="Brightness slider"
            tabIndex={0}
          />
        </label>
      </div>
      <button className={styles.addRecent} onClick={handleAddRecent} aria-label="Add to recent colors" tabIndex={0}>
        Add to Recent
      </button>
      <div className={styles.recentColors} aria-label="Recent colors" tabIndex={0}>
        {recentColors.map((hex) => (
          <button
            key={hex}
            className={styles.recentSwatch}
            style={{ background: hex }}
            onClick={() => handleRecentClick(hex)}
            aria-label={`Recent color ${hex}`}
            tabIndex={0}
          />
        ))}
      </div>
    </div>
  );
}
