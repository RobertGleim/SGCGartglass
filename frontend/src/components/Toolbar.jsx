import React, { useState } from 'react';
import useToolbar from '../hooks/useToolbar';
import styles from './Toolbar.module.css';
// Font Awesome icons (assume loaded globally or via CDN)
import ReactTooltip from 'react-tooltip';

const TOOL_ICONS = {
  paintBucket: 'fas fa-fill-drip',
  eyedropper: 'fas fa-eye-dropper',
  eraser: 'fas fa-eraser',
  hand: 'fas fa-hand-paper',
};
const TOOL_NAMES = {
  paintBucket: 'Paint Bucket',
  eyedropper: 'Eyedropper',
  eraser: 'Eraser',
  hand: 'Hand Tool',
};

const ACTIONS = [
  { name: 'Undo', icon: 'fas fa-undo', shortcut: 'Ctrl+Z', action: 'undo' },
  { name: 'Redo', icon: 'fas fa-redo', shortcut: 'Ctrl+Y', action: 'redo' },
  { name: 'Clear All', icon: 'fas fa-trash', shortcut: '', action: 'clear' },
  { name: 'Reset View', icon: 'fas fa-sync-alt', shortcut: '', action: 'reset' },
  { name: 'Zoom In', icon: 'fas fa-search-plus', shortcut: '', action: 'zoomIn' },
  { name: 'Zoom Out', icon: 'fas fa-search-minus', shortcut: '', action: 'zoomOut' },
];

export default function Toolbar({
  onAction,
  onTogglePieceNumbers,
  showPieceNumbers,
  outlineThickness,
  setOutlineThickness,
}) {
  const { activeTool, setActiveTool, TOOL_KEYS } = useToolbar();
  const [mobileMenu, setMobileMenu] = useState(false);
  const isMobile = window.innerWidth < 767;

  // Responsive: collapse to hamburger menu
  const handleHamburger = () => setMobileMenu((open) => !open);


  // Accessibility: ARIA labels, keyboard navigation

  return (
    <nav className={styles.toolbar} aria-label="Toolbar">
      <ReactTooltip effect="solid" />
      {isMobile ? (
        <div className={styles.mobileToolbar}>
          <button className={styles.fab} aria-label="Primary tool" tabIndex={0}>
            <i className="fas fa-fill-drip" />
          </button>
          <div className={styles.bottomNav}>
            <button className={styles.navBtn} aria-label="Paint Bucket" tabIndex={0}>
              <i className="fas fa-fill-drip" />
            </button>
            <button className={styles.navBtn} aria-label="Eyedropper" tabIndex={0}>
              <i className="fas fa-eye-dropper" />
            </button>
            <button className={styles.navBtn} aria-label="Eraser" tabIndex={0}>
              <i className="fas fa-eraser" />
            </button>
            <button className={styles.navBtn} aria-label="Hand Tool" tabIndex={0}>
              <i className="fas fa-hand-paper" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className={styles.hamburger}
            aria-label="Open toolbar menu"
            onClick={handleHamburger}
            tabIndex={0}
          >
            <i className="fas fa-bars" />
          </button>
          <div className={mobileMenu ? styles.menuOpen : styles.menu}>
            <div className={styles.tools}>
              {Object.entries(TOOL_ICONS).map(([tool, icon]) => (
                <button
                  key={tool}
                  className={
                    activeTool === tool
                      ? `${styles.toolBtn} ${styles.active}`
                      : styles.toolBtn
                  }
                  aria-label={TOOL_NAMES[tool]}
                  tabIndex={0}
                  onClick={() => setActiveTool(tool)}
                  data-tip={`${TOOL_NAMES[tool]} (${TOOL_KEYS[tool].toUpperCase()})`}
                >
                  <i className={icon} />
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              {ACTIONS.map(({ name, icon, action }) => (
                <button
                  key={action}
                  className={styles.actionBtn}
                  aria-label={name}
                  tabIndex={0}
                  onClick={() => onAction && onAction(action)}
                  data-tip={name}
                >
                  <i className={icon} />
                </button>
              ))}
            </div>
            <div className={styles.viewOptions}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={showPieceNumbers}
                  onChange={() => onTogglePieceNumbers && onTogglePieceNumbers()}
                  aria-label="Show piece numbers"
                  tabIndex={0}
                />
                Show Piece Numbers
              </label>
              <label className={styles.sliderLabel}>
                Outline Thickness
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={outlineThickness}
                  onChange={(e) => setOutlineThickness && setOutlineThickness(Number(e.target.value))}
                  aria-label="Outline thickness"
                  tabIndex={0}
                />
                <span>{outlineThickness}px</span>
              </label>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
