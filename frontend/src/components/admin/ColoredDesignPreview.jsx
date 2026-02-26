import React, { useEffect, useRef, useState, useMemo } from 'react';
import styles from './ColoredDesignPreview.module.css';

/**
 * Renders the customer's colored design for admin work order review.
 *
 * Supports:
 *  - SVG templates: parses svg_content, applies fill colors from design_data.sections
 *  - Image/flood-fill templates: shows the saved preview_url (base64 snapshot)
 *
 * Each section gets a numbered label overlay. Clicking a number/section
 * shows a popover with color swatch, color name/hex, and glass type.
 */

// Convert hex to an approximate CSS colour name
const HEX_COLOR_NAMES = {
  '#e63946': 'Red', '#ff6b6b': 'Coral', '#ff9e7a': 'Salmon', '#ffb6c1': 'Light Pink',
  '#f4a261': 'Sandy Orange', '#ffd700': 'Gold', '#f4e04d': 'Yellow', '#ffeaa7': 'Cream Yellow',
  '#2a9d8f': 'Teal', '#52b788': 'Green', '#90ee90': 'Light Green', '#98fb98': 'Pale Green',
  '#1d3557': 'Dark Blue', '#457b9d': 'Steel Blue', '#87ceeb': 'Sky Blue', '#add8e6': 'Light Blue',
  '#7b2d8b': 'Purple', '#9b5de5': 'Violet', '#dda0dd': 'Plum', '#b8b8ff': 'Lavender',
  '#8b4513': 'Saddle Brown', '#c8a96e': 'Tan', '#d4c5a9': 'Beige', '#e8d5b7': 'Wheat',
  '#a0c4c7': 'Opal', '#6b8e8b': 'Sage', '#c9a84c': 'Amber', '#4a2e0a': 'Espresso',
  '#ffffff': 'White', '#cccccc': 'Light Gray', '#888888': 'Gray', '#222222': 'Near Black',
};

const getColorName = (hex) => {
  if (!hex) return 'None';
  const h = hex.toLowerCase();
  return HEX_COLOR_NAMES[h] || h;
};

export default function ColoredDesignPreview({ designData, template }) {
  const svgContainerRef = useRef(null);
  const [popover, setPopover] = useState(null); // { sectionId, x, y, color, glassType }
  const [sectionCenters, setSectionCenters] = useState([]); // [{ id, cx, cy }]

  const sections = designData?.sections || {};
  const previewUrl = designData?.preview_url || designData?.dataUrl || '';
  const isFloodFill = !!designData?.floodFill;
  const hasSvg = template?.svg_content && template?.template_type === 'svg';

  // Parse and colour the SVG
  const coloredSvgHtml = useMemo(() => {
    if (!hasSvg) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(template.svg_content, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return template.svg_content;

    // Make SVG responsive
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.maxWidth = '100%';

    // Apply colours from sections map
    const paths = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
    paths.forEach((el, idx) => {
      const regionId = el.getAttribute('id') || el.getAttribute('data-id') || String(idx);
      const sectionData = sections[regionId];
      if (sectionData?.color) {
        el.setAttribute('fill', sectionData.color);
        el.setAttribute('fill-opacity', '1');
      }
      // Add data attribute so we can match clicks
      el.setAttribute('data-section-id', regionId);
      // Make clickable
      el.style.cursor = 'pointer';
    });

    return svg.outerHTML;
  }, [hasSvg, template?.svg_content, sections]);

  // Compute section label positions after SVG renders
  useEffect(() => {
    if (!hasSvg || !svgContainerRef.current) return;

    // Wait for browser to render
    requestAnimationFrame(() => {
      const container = svgContainerRef.current;
      if (!container) return;
      const svgEl = container.querySelector('svg');
      if (!svgEl) return;

      const containerRect = container.getBoundingClientRect();
      const centers = [];

      const paths = svgEl.querySelectorAll('[data-section-id]');
      paths.forEach((el) => {
        const id = el.getAttribute('data-section-id');
        if (!sections[id]) return; // only label coloured sections
        try {
          const bbox = el.getBoundingClientRect();
          const cx = bbox.left + bbox.width / 2 - containerRect.left;
          const cy = bbox.top + bbox.height / 2 - containerRect.top;
          // Skip tiny regions (outlines/lines)
          if (bbox.width < 8 || bbox.height < 8) return;
          centers.push({ id, cx, cy });
        } catch {
          // getBBox can fail for hidden elements
        }
      });

      setSectionCenters(centers);
    });
  }, [coloredSvgHtml, sections, hasSvg]);

  // Handle click on SVG section
  const handleSvgClick = (e) => {
    const el = e.target.closest('[data-section-id]');
    if (!el) { setPopover(null); return; }
    const sectionId = el.getAttribute('data-section-id');
    const data = sections[sectionId];
    if (!data) { setPopover(null); return; }

    const containerRect = svgContainerRef.current.getBoundingClientRect();
    setPopover({
      sectionId,
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
      color: data.color,
      glassType: data.glassType,
      glassTypeId: data.glassTypeId,
    });
  };

  // Handle label click
  const handleLabelClick = (center, e) => {
    e.stopPropagation();
    const data = sections[center.id];
    if (!data) return;
    setPopover({
      sectionId: center.id,
      x: center.cx,
      y: center.cy,
      color: data.color,
      glassType: data.glassType,
      glassTypeId: data.glassTypeId,
    });
  };

  const sectionEntries = Object.entries(sections);
  const hasSections = sectionEntries.length > 0;

  // ----- Flood-fill / image-based template -----
  if (isFloodFill || !hasSvg) {
    return (
      <div className={styles.container}>
        {previewUrl ? (
          <div className={styles.previewWrap}>
            <img src={previewUrl} alt="Design preview" className={styles.previewImg} />
          </div>
        ) : (
          <div className={styles.noPreview}>No design preview available</div>
        )}
        {hasSections && (
          <div className={styles.sectionList}>
            <h4 className={styles.sectionListTitle}>Section Details</h4>
            <div className={styles.sectionGrid}>
              {sectionEntries.map(([id, data], idx) => (
                <div key={id} className={styles.sectionItem}>
                  <span className={styles.sectionNumber}>{idx + 1}</span>
                  <div className={styles.sectionSwatch} style={{ backgroundColor: data.color || '#ccc' }} />
                  <div className={styles.sectionInfo}>
                    <span className={styles.sectionColorName}>{getColorName(data.color)}</span>
                    <span className={styles.sectionHex}>{data.color || '—'}</span>
                    <span className={styles.sectionGlass}>{data.glassType || 'No glass type'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----- SVG template with interactive sections -----
  return (
    <div className={styles.container}>
      <div
        ref={svgContainerRef}
        className={styles.svgContainer}
        onClick={handleSvgClick}
        dangerouslySetInnerHTML={{ __html: coloredSvgHtml }}
      />

      {/* Numbered labels overlaid on sections */}
      {sectionCenters.map((center, idx) => (
        <div
          key={center.id}
          className={styles.sectionLabel}
          style={{ left: center.cx, top: center.cy }}
          onClick={(e) => handleLabelClick(center, e)}
          title={`Section ${idx + 1}: Click for details`}
        >
          {idx + 1}
        </div>
      ))}

      {/* Popover */}
      {popover && (
        <div
          className={styles.popover}
          style={{
            left: Math.min(popover.x, (svgContainerRef.current?.offsetWidth || 400) - 180),
            top: popover.y + 20,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className={styles.popoverClose} onClick={() => setPopover(null)}>&times;</button>
          <div className={styles.popoverHeader}>Section #{popover.sectionId}</div>
          <div className={styles.popoverBody}>
            <div className={styles.popoverSwatch} style={{ backgroundColor: popover.color || '#ccc' }} />
            <div className={styles.popoverDetails}>
              <div className={styles.popoverColorName}>{getColorName(popover.color)}</div>
              <div className={styles.popoverHex}>{popover.color || '—'}</div>
              <div className={styles.popoverGlass}>
                {popover.glassType || 'No glass type selected'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section list below SVG */}
      {hasSections && (
        <div className={styles.sectionList}>
          <h4 className={styles.sectionListTitle}>All Sections</h4>
          <div className={styles.sectionGrid}>
            {sectionEntries.map(([id, data], idx) => (
              <div
                key={id}
                className={`${styles.sectionItem} ${popover?.sectionId === id ? styles.sectionItemActive : ''}`}
                onClick={() => {
                  const center = sectionCenters.find(c => c.id === id);
                  if (center) {
                    setPopover({
                      sectionId: id,
                      x: center.cx,
                      y: center.cy,
                      color: data.color,
                      glassType: data.glassType,
                      glassTypeId: data.glassTypeId,
                    });
                  }
                }}
              >
                <span className={styles.sectionNumber}>{idx + 1}</span>
                <div className={styles.sectionSwatch} style={{ backgroundColor: data.color || '#ccc' }} />
                <div className={styles.sectionInfo}>
                  <span className={styles.sectionColorName}>{getColorName(data.color)}</span>
                  <span className={styles.sectionHex}>{data.color || '—'}</span>
                  <span className={styles.sectionGlass}>{data.glassType || 'No glass type'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
