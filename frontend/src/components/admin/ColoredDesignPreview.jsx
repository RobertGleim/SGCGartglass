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

  // Helper: detect if a fill colour is very dark (outline / leading)
  const isOutlineFill = (fill) => {
    if (!fill || fill === 'none' || fill === '' || fill === 'transparent') return true;
    if (typeof fill !== 'string') return false;
    let r, g, b;
    if (fill.startsWith('#')) {
      const hex = fill.replace('#', '');
      const full = hex.length === 3 ? hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2] : hex;
      r = parseInt(full.substring(0, 2), 16);
      g = parseInt(full.substring(2, 4), 16);
      b = parseInt(full.substring(4, 6), 16);
    } else if (fill === 'black') {
      r = g = b = 0;
    } else {
      return false;
    }
    return (0.299 * r + 0.587 * g + 0.114 * b) < 30;
  };

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

    // Get viewBox dimensions for border detection
    const vbAttr = svg.getAttribute('viewBox');
    let svgW = 0, svgH = 0;
    if (vbAttr) {
      const parts = vbAttr.split(/[\\s,]+/).map(Number);
      svgW = parts[2] || 0;
      svgH = parts[3] || 0;
    }

    // Apply colours from sections map and mark fillable sections
    const paths = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
    // First pass: collect bboxes by rendering into a temp container for measurement
    // We'll use a simpler heuristic: mark paths with data attributes, then detect
    // borders in the useEffect where getBBox() is available.
    let sectionNum = 0;
    paths.forEach((el, idx) => {
      const regionId = el.getAttribute('id') || el.getAttribute('data-id') || String(idx);
      const sectionData = sections[regionId];
      if (sectionData?.color) {
        el.setAttribute('fill', sectionData.color);
        el.setAttribute('fill-opacity', '1');
      }
      el.setAttribute('data-section-id', regionId);

      // Detect fillable sections (not outlines)
      const origFill = el.getAttribute('fill');
      const isFillable = !isOutlineFill(origFill);
      if (isFillable) {
        sectionNum++;
        el.setAttribute('data-section-num', String(sectionNum));
        el.style.cursor = 'pointer';
      }
    });

    return svg.outerHTML;
  }, [hasSvg, template?.svg_content, sections]);

  // Inject numbered labels directly into the SVG after render
  useEffect(() => {
    if (!hasSvg || !svgContainerRef.current) return;

    const frame = requestAnimationFrame(() => {
      const container = svgContainerRef.current;
      if (!container) return;
      const svgEl = container.querySelector('svg');
      if (!svgEl) return;

      // Remove previously injected labels and leader lines
      svgEl.querySelectorAll('.cdp-lbl-txt, .cdp-lbl-line').forEach(n => n.remove());

      const containerRect = container.getBoundingClientRect();
      const centers = [];
      const labeled = svgEl.querySelectorAll('[data-section-num]');

      // Get SVG viewBox for boundary clamping
      const vb = svgEl.viewBox?.baseVal;
      const svgW = vb?.width || svgEl.width?.baseVal?.value || 400;
      const svgH = vb?.height || svgEl.height?.baseVal?.value || 400;

      // --- Pass 1: collect all section info with bounding boxes ---
      const raw = [];
      const EDGE_MARGIN = 5;
      labeled.forEach((el) => {
        const id = el.getAttribute('data-section-id');
        const num = el.getAttribute('data-section-num');
        const sectionData = sections[id];
        if (sectionData?.color) return;
        try {
          const bbox = el.getBBox();
          if (bbox.width < 3 || bbox.height < 3) return;
          // Skip border/frame sections that touch SVG viewBox edges
          const touchesEdge = bbox.x < EDGE_MARGIN || bbox.y < EDGE_MARGIN ||
            (bbox.x + bbox.width > svgW - EDGE_MARGIN) ||
            (bbox.y + bbox.height > svgH - EDGE_MARGIN);
          if (touchesEdge) return;
          raw.push({
            el, id, num,
            cx: bbox.x + bbox.width / 2,
            cy: bbox.y + bbox.height / 2,
            left: bbox.x, top: bbox.y,
            right: bbox.x + bbox.width,
            bottom: bbox.y + bbox.height,
            w: bbox.width, h: bbox.height,
            area: bbox.width * bbox.height,
          });
        } catch { /* getBBox can fail */ }
      });

      // --- Pass 2: remove background/container sections ---
      const filtered = raw.filter((s) => {
        let contained = 0;
        for (const other of raw) {
          if (other === s) continue;
          if (other.cx > s.left && other.cx < s.right &&
              other.cy > s.top && other.cy < s.bottom) {
            contained++;
            if (contained >= 2) return false;
          }
        }
        return true;
      });

      // --- Pass 3: deduplicate close centroids & draw labels ---
      const placed = [];
      filtered.forEach((s) => {
        const tooClose = placed.some(p => Math.abs(p.x - s.cx) < 12 && Math.abs(p.y - s.cy) < 12);
        if (tooClose) return;
        placed.push({ x: s.cx, y: s.cy });

        const isSmall = Math.min(s.w, s.h) < 25;
        let labelX = s.cx;
        let labelY = s.cy;

        if (isSmall) {
          const dx = s.cx - svgW / 2;
          const dy = s.cy - svgH / 2;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const offsetDist = 30;
          labelX = s.cx + (dx / dist) * offsetDist;
          labelY = s.cy + (dy / dist) * offsetDist;
          labelX = Math.max(10, Math.min(svgW - 10, labelX));
          labelY = Math.max(10, Math.min(svgH - 10, labelY));

          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', s.cx);
          line.setAttribute('y1', s.cy);
          line.setAttribute('x2', labelX);
          line.setAttribute('y2', labelY);
          line.setAttribute('stroke', '#444');
          line.setAttribute('stroke-width', '0.8');
          line.setAttribute('class', 'cdp-lbl-line');
          line.style.pointerEvents = 'none';
          svgEl.appendChild(line);
        }

        const fontSize = isSmall
          ? Math.max(7, Math.min(svgW, svgH) * 0.02)
          : Math.max(8, Math.min(s.w, s.h) * 0.18);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', fontSize);
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('fill', '#222');
        text.setAttribute('class', 'cdp-lbl-txt');
        text.style.pointerEvents = 'none';
        text.textContent = s.num;
        svgEl.appendChild(text);

          // Track for popover positioning
          const elRect = s.el.getBoundingClientRect();
          centers.push({
            id: s.id,
            num: parseInt(s.num, 10),
            cx: elRect.left + elRect.width / 2 - containerRect.left,
            cy: elRect.top + elRect.height / 2 - containerRect.top,
          });
      });

      setSectionCenters(centers);
    });

    return () => cancelAnimationFrame(frame);
  }, [coloredSvgHtml, hasSvg]);

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
            {sectionEntries.map(([id, data]) => {
              const center = sectionCenters.find(c => c.id === id);
              const displayNum = center?.num || id;
              return (
                <div
                  key={id}
                  className={`${styles.sectionItem} ${popover?.sectionId === id ? styles.sectionItemActive : ''}`}
                  onClick={() => {
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
                  <span className={styles.sectionNumber}>{displayNum}</span>
                  <div className={styles.sectionSwatch} style={{ backgroundColor: data.color || '#ccc' }} />
                  <div className={styles.sectionInfo}>
                    <span className={styles.sectionColorName}>{getColorName(data.color)}</span>
                    <span className={styles.sectionHex}>{data.color || '—'}</span>
                    <span className={styles.sectionGlass}>{data.glassType || 'No glass type'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
