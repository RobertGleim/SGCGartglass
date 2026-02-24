import { useState, useEffect } from 'react';

// Utility: Convert RGB to Hex
function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Utility: Convert Hex to RGB
function hexToRgb(hex) {
  const validHex = /^#?([a-fA-F0-9]{6})$/;
  const match = hex.match(validHex);
  if (!match) return null;
  const h = match[1];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export default function useColorPicker() {
  const [currentColor, setCurrentColor] = useState({ r: 0, g: 0, b: 0, hex: '#000000' });
  const [recentColors, setRecentColors] = useState([]);

  // Load recent colors from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentColors');
    if (stored) setTimeout(() => setRecentColors(JSON.parse(stored)), 0);
  }, []);

  // Sync hex when RGB changes
  useEffect(() => {
    setTimeout(() => setCurrentColor((color) => ({ ...color, hex: rgbToHex(color.r, color.g, color.b) })), 0);
  }, [currentColor.r, currentColor.g, currentColor.b]);

  // Sync RGB when hex changes
  useEffect(() => {
    const rgb = hexToRgb(currentColor.hex);
    if (rgb) setTimeout(() => setCurrentColor((color) => ({ ...color, ...rgb })), 0);
  }, [currentColor.hex]);

  // Add color to recent colors
  function addToRecentColors(hex) {
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== hex);
      const updated = [hex, ...filtered].slice(0, 10);
      localStorage.setItem('recentColors', JSON.stringify(updated));
      return updated;
    });
  }

  return {
    currentColor,
    setCurrentColor,
    recentColors,
    addToRecentColors,
    rgbToHex,
    hexToRgb,
  };
}
