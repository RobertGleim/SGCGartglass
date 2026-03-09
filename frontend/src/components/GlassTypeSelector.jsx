import React, { useState, useRef } from 'react';
import useGlassTypes from '../hooks/useGlassTypes';
import LoadingMessage from './LoadingMessage';
import styles from './GlassTypeSelector.module.css';

export default function GlassTypeSelector({ onSelect }) {
  const {
    glassTypes,
    currentGlassType,
    loading,
    selectGlassType,
  } = useGlassTypes();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredType, setHoveredType] = useState(null);
  const dropdownRef = useRef(null);

  // Lazy load textures when dropdown opens
  const [texturesLoaded, setTexturesLoaded] = useState(false);
  const handleDropdownOpen = () => {
    setDropdownOpen(true);
    setTexturesLoaded(true);
  };
  const handleDropdownClose = () => {
    setDropdownOpen(false);
    setHoveredType(null);
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!dropdownOpen) return;
    const idx = glassTypes.findIndex((g) => g.id === (hoveredType ? hoveredType.id : currentGlassType?.id));
    if (e.key === 'ArrowDown') {
      const next = glassTypes[(idx + 1) % glassTypes.length];
      setHoveredType(next);
    } else if (e.key === 'ArrowUp') {
      const prev = glassTypes[(idx - 1 + glassTypes.length) % glassTypes.length];
      setHoveredType(prev);
    } else if (e.key === 'Enter' && hoveredType) {
      selectGlassType(hoveredType);
      onSelect && onSelect(hoveredType);
      handleDropdownClose();
    } else if (e.key === 'Escape') {
      handleDropdownClose();
    }
  };

  // Select glass type
  const handleSelect = (glassType) => {
    selectGlassType(glassType);
    onSelect && onSelect(glassType);
    handleDropdownClose();
  };

  // Render texture preview
  const renderTexture = (glassType, size = 100) => (
    <img
      src={texturesLoaded ? glassType.textureUrl : ''}
      alt={glassType.name}
      className={styles.texture}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );

  return (
    <div className={styles.selector}>
      <div
        className={styles.selected}
        tabIndex={0}
        aria-label="Selected glass type"
        onClick={handleDropdownOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleDropdownOpen();
        }}
      >
        {currentGlassType && renderTexture(currentGlassType)}
        <span className={styles.selectedName}>{currentGlassType?.name || 'Select Glass Type'}</span>
        <span className={styles.dropdownArrow} aria-hidden>▼</span>
      </div>
      {dropdownOpen && (
        <div
          className={styles.dropdown}
          ref={dropdownRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Glass type dropdown"
        >
          {loading ? (
            <LoadingMessage label="Loading" className={styles.loading} />
          ) : (
            glassTypes.map((glassType) => (
              <div
                key={glassType.id}
                className={
                  `${styles.option} ${hoveredType?.id === glassType.id ? styles.hovered : ''}`
                }
                tabIndex={0}
                aria-label={glassType.name}
                onMouseEnter={() => setHoveredType(glassType)}
                onMouseLeave={() => setHoveredType(null)}
                onClick={() => handleSelect(glassType)}
              >
                {renderTexture(glassType)}
                <span className={styles.optionName}>{glassType.name}</span>
                {hoveredType?.id === glassType.id && (
                  <div className={styles.largePreview}>
                    {renderTexture(glassType, 200)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
