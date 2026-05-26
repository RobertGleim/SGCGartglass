import React, { useEffect, useRef, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
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

const getFittedSectionLabelFontPx = (sectionNumber, width, height, clearancePx = null) => {
  const digits = String(sectionNumber ?? '').length || 1;
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  // Slightly smaller labels reduce overlap in tight sections.
  const maxByHeight = safeHeight * 0.50;
  const maxByWidth = (safeWidth * 0.60) / Math.max(1, digits * 0.68);
  const maxByClearance = Number.isFinite(Number(clearancePx)) ? Math.max(2, Number(clearancePx) * 1.55) : 12;
  return Math.max(2, Math.min(12, maxByHeight, maxByWidth, maxByClearance));
};

const getStableSectionOrder = (regions = []) => {
  if (!Array.isArray(regions) || regions.length === 0) return [];
  const canvasH = Number(regions[0]?.canvasH) || 600;
  const rowTolerance = Math.max(4, canvasH * 0.02);
  return [...regions].sort((a, b) => {
    const rowA = Math.round((Number(a?.cy) || 0) / rowTolerance);
    const rowB = Math.round((Number(b?.cy) || 0) / rowTolerance);
    if (rowA !== rowB) return rowA - rowB;

    const ax = Number(a?.cx) || 0;
    const bx = Number(b?.cx) || 0;
    if (Math.abs(ax - bx) > 1) return ax - bx;

    const ay = Number(a?.cy) || 0;
    const by = Number(b?.cy) || 0;
    if (Math.abs(ay - by) > 1) return ay - by;

    return String(a?.id || '').localeCompare(String(b?.id || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
};

const spreadSectionLabelPositions = (labels = []) => {
  if (!Array.isArray(labels) || labels.length < 2) return labels;

  const clampLabel = (label, x, y) => {
    const baseX = Number(label.baseCx ?? label.cx ?? 0);
    const baseY = Number(label.baseCy ?? label.cy ?? 0);
    const w = Math.max(1, Number(label.w) || 1);
    const h = Math.max(1, Number(label.h) || 1);
    const maxDx = Math.max(2, w * 0.34);
    const maxDy = Math.max(2, h * 0.34);
    let nextX = Math.max(baseX - maxDx, Math.min(baseX + maxDx, x));
    let nextY = Math.max(baseY - maxDy, Math.min(baseY + maxDy, y));

    const hasBounds = [label.left, label.top, label.right, label.bottom].every((value) => Number.isFinite(Number(value)));
    if (hasBounds) {
      const left = Number(label.left);
      const top = Number(label.top);
      const right = Number(label.right);
      const bottom = Number(label.bottom);
      const digits = String(label.num ?? '').length || 1;
      const fontPx = Math.max(2, Number(label.fontPx) || 6);
      const labelHalfW = (fontPx * 0.62 * digits) / 2;
      const labelHalfH = (fontPx * 0.58) / 2;
      const padX = Math.min(10, Math.max(1, w * 0.12, labelHalfW + 0.8));
      const padY = Math.min(10, Math.max(1, h * 0.12, labelHalfH + 0.8));
      const minX = left + padX;
      const maxX = right - padX;
      const minY = top + padY;
      const maxY = bottom - padY;
      if (minX <= maxX) nextX = Math.max(minX, Math.min(maxX, nextX));
      if (minY <= maxY) nextY = Math.max(minY, Math.min(maxY, nextY));
    }

    return { x: nextX, y: nextY };
  };

  const arranged = labels.map((label) => ({
    ...label,
    baseCx: Number(label.cx) || 0,
    baseCy: Number(label.cy) || 0,
    cx: Number(label.cx) || 0,
    cy: Number(label.cy) || 0,
  }));

  for (let pass = 0; pass < 14; pass += 1) {
    for (let i = 0; i < arranged.length; i += 1) {
      for (let j = i + 1; j < arranged.length; j += 1) {
        const a = arranged[i];
        const b = arranged[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.hypot(dx, dy);
        const aSize = Math.max(4, Number(a.fontPx) || 6);
        const bSize = Math.max(4, Number(b.fontPx) || 6);
        const minDist = Math.max(8, (aSize + bSize) * 0.8);
        if (dist >= minDist) continue;

        const overlap = (minDist - Math.max(0.001, dist)) * 0.5;
        let ux = dx / Math.max(0.001, dist);
        let uy = dy / Math.max(0.001, dist);
        if (!Number.isFinite(ux) || !Number.isFinite(uy)) {
          const seed = (Number(a.num) || i + 1) * 73 + (Number(b.num) || j + 1) * 37;
          const theta = (seed % 360) * (Math.PI / 180);
          ux = Math.cos(theta);
          uy = Math.sin(theta);
        }

        const aNext = clampLabel(a, a.cx - ux * overlap, a.cy - uy * overlap);
        const bNext = clampLabel(b, b.cx + ux * overlap, b.cy + uy * overlap);
        a.cx = aNext.x;
        a.cy = aNext.y;
        b.cx = bNext.x;
        b.cy = bNext.y;
      }
    }
  }

  return arranged;
};

const estimateClearanceAtPoint = (x, y, left, top, right, bottom, isInside, maxStep = 22) => {
  if (typeof isInside !== 'function') return 0;
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.707, 0.707],
    [0.707, -0.707],
    [-0.707, 0.707],
    [-0.707, -0.707],
  ];

  let minReach = maxStep;
  for (const [dx, dy] of directions) {
    let reach = 0;
    for (let step = 1; step <= maxStep; step += 1) {
      const px = x + dx * step;
      const py = y + dy * step;
      if (px < left || px > right || py < top || py > bottom || !isInside(px, py)) {
        reach = step - 1;
        break;
      }
      reach = step;
    }
    minReach = Math.min(minReach, reach);
  }

  return Math.max(0, minReach);
};

const getBestInteriorPoint = ({ left, top, right, bottom, fallbackX, fallbackY, isInside }) => {
  const fallback = { x: fallbackX, y: fallbackY, clearancePx: 0 };
  if (typeof isInside !== 'function') return fallback;

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const maxStep = Math.max(8, Math.min(26, Math.floor(Math.min(width, height) * 0.45)));

  let best = null;
  const cols = 9;
  const rows = 9;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = left + ((c + 0.5) / cols) * width;
      const y = top + ((r + 0.5) / rows) * height;
      if (!isInside(x, y)) continue;
      const clearancePx = estimateClearanceAtPoint(x, y, left, top, right, bottom, isInside, maxStep);
      const dx = x - fallbackX;
      const dy = y - fallbackY;
      const distSq = (dx * dx) + (dy * dy);
      if (!best || clearancePx > best.clearancePx || (clearancePx === best.clearancePx && distSq < best.distSq)) {
        best = { x, y, clearancePx, distSq };
      }
    }
  }

  if (best) return { x: best.x, y: best.y, clearancePx: best.clearancePx };
  return fallback;
};

const getAnchorForSvgElement = (svgEl, geometryEl, bbox) => {
  const fallback = {
    x: bbox.x + (bbox.width / 2),
    y: bbox.y + (bbox.height / 2),
  };
  if (!svgEl || !geometryEl || !bbox || bbox.width <= 0 || bbox.height <= 0) return { ...fallback, clearancePx: 0 };
  if (typeof geometryEl.isPointInFill !== 'function' || typeof svgEl.createSVGPoint !== 'function') {
    return { ...fallback, clearancePx: 0 };
  }

  const isInside = (x, y) => {
    try {
      const point = svgEl.createSVGPoint();
      point.x = x;
      point.y = y;
      return !!geometryEl.isPointInFill(point);
    } catch {
      return false;
    }
  };

  return getBestInteriorPoint({
    left: bbox.x,
    top: bbox.y,
    right: bbox.x + bbox.width,
    bottom: bbox.y + bbox.height,
    fallbackX: fallback.x,
    fallbackY: fallback.y,
    isInside,
  });
};

export default function ColoredDesignPreview({ designData, template, editable = false, locked = false, showExportBar = false, onDesignDataChange }) {
  const svgContainerRef = useRef(null);
  const [popover, setPopover] = useState(null); // { sectionId, x, y, color, glassType }
  const [sectionCenters, setSectionCenters] = useState([]); // [{ id, cx, cy }]
  const [highlightedSection, setHighlightedSection] = useState(null);
  const [workingSections, setWorkingSections] = useState(designData?.sections || {});
  const [activeSectionMeta, setActiveSectionMeta] = useState(null); // { id, num }
  const [editColor, setEditColor] = useState('#98fb98');
  const [savingDesign, setSavingDesign] = useState(false);

  useEffect(() => {
    setWorkingSections(designData?.sections || {});
  }, [designData?.sections]);

  const sections = useMemo(() => (workingSections || {}), [workingSections]);
  const hasSvg = !!template?.svg_content;
  const isEditingEnabled = editable && hasSvg && !locked;
  const showEditableSvgGuard = editable && !hasSvg && !showExportBar;

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderToRasterDataUrl = (mime = 'image/png', quality = 0.92) => new Promise((resolve, reject) => {
    const svgEl = svgContainerRef.current?.querySelector('svg');
    if (svgEl) {
      const serialized = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const vb = svgEl.viewBox?.baseVal;
        const width = Math.max(1, Math.round(vb?.width || svgEl.clientWidth || 1000));
        const height = Math.max(1, Math.round(vb?.height || svgEl.clientHeight || 1000));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(svgUrl);
        resolve(canvas.toDataURL(mime, quality));
      };
      image.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Failed to render preview.'));
      };
      image.src = svgUrl;
      return;
    }
    const fallback = designData?.preview_url || designData?.dataUrl;
    if (fallback) {
      resolve(fallback);
    } else {
      reject(new Error('No preview available for export.'));
    }
  });

  const handleDownloadSvg = async () => {
    const svgEl = svgContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serialized = new XMLSerializer().serializeToString(svgEl);
    downloadBlob(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }), 'design-final.svg');
  };

  const handleDownloadPng = async () => {
    const dataUrl = await renderToRasterDataUrl('image/png');
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadBlob(blob, 'design-final.png');
  };

  const handleDownloadJpeg = async () => {
    const dataUrl = await renderToRasterDataUrl('image/jpeg', 0.94);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadBlob(blob, 'design-final.jpg');
  };

  const handleDownloadPdf = async () => {
    const dataUrl = await renderToRasterDataUrl('image/png');
    const [{ jsPDF }, image] = await Promise.all([
      import('jspdf'),
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to prepare PDF image.'));
        img.src = dataUrl;
      }),
    ]);
    const pdf = new jsPDF({ orientation: image.width >= image.height ? 'landscape' : 'portrait', unit: 'pt', format: [image.width, image.height] });
    pdf.addImage(dataUrl, 'PNG', 0, 0, image.width, image.height);
    pdf.save('design-final.pdf');
  };

  const handlePrint = async () => {
    const dataUrl = await renderToRasterDataUrl('image/png');
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Print Design</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#fff;}img{max-width:100%;max-height:100vh;}</style></head><body><img src="${dataUrl}" alt="Final Design" /></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const persistSections = async (nextSections) => {
    if (!onDesignDataChange) return;
    setSavingDesign(true);
    try {
      await onDesignDataChange({
        ...(designData || {}),
        sections: nextSections,
      });
    } finally {
      setSavingDesign(false);
    }
  };

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

    // Apply colours from sections map and mark fillable sections
    const paths = svg.querySelectorAll('path, polygon, rect, circle, ellipse');
    paths.forEach((el, idx) => {
      const regionId = el.getAttribute('id') || el.getAttribute('data-id') || String(idx);
      const sectionData = sections[regionId];
      if (sectionData?.color) {
        el.setAttribute('fill', sectionData.color);
        el.setAttribute('fill-opacity', '1');
      }
      el.setAttribute('data-section-id', regionId);

      // Mark fillable sections (not outlines) for the useEffect to number
      const origFill = el.getAttribute('fill');
      const isFillable = !isOutlineFill(origFill);
      if (isFillable) {
        el.setAttribute('data-fillable', 'true');
        el.style.cursor = 'pointer';
      }
    });

    return DOMPurify.sanitize(svg.outerHTML, { USE_PROFILES: { svg: true, svgFilters: true } });
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

      // Get SVG viewBox for boundary clamping
      const vb = svgEl.viewBox?.baseVal;
      const svgW = vb?.width || svgEl.width?.baseVal?.value || 400;
      const svgH = vb?.height || svgEl.height?.baseVal?.value || 400;

      // --- Step 1: assign section numbers matching the designer ---
      // The designer numbers all non-border, non-outline selectable objects
      // sequentially. We replicate that logic here using getBBox for border
      // detection (sections touching 2+ SVG edges are borders).
      const EDGE_MARGIN = 5;
      const isTracedSvgTemplate = !!template?.image_url;
      const svgArea = svgW * svgH;
      const MIN_SEGMENT_AREA = isTracedSvgTemplate ? Math.max(10, svgArea * 0.00003) : 0;
      const MIN_SEGMENT_SIDE = isTracedSvgTemplate ? 2 : 2;
      const MAX_SEGMENT_ASPECT = isTracedSvgTemplate ? 120 : 120;
      const sectionIdByNum = {};
      Object.entries(sections).forEach(([id, data]) => {
        const num = Number(data?.sectionNum);
        if (Number.isFinite(num) && num > 0 && !sectionIdByNum[num]) {
          sectionIdByNum[num] = id;
        }
      });
      const fillableEls = Array.from(svgEl.querySelectorAll('[data-fillable]'));
      const candidates = [];
      fillableEls.forEach((el, idx) => {
        try {
          const bbox = el.getBBox();
          const area = bbox.width * bbox.height;
          const aspect = Math.max(bbox.width, bbox.height) / Math.max(1, Math.min(bbox.width, bbox.height));
          if (bbox.width < MIN_SEGMENT_SIDE || bbox.height < MIN_SEGMENT_SIDE || area < MIN_SEGMENT_AREA || aspect > MAX_SEGMENT_ASPECT) return;
          // Border detection: skip sections touching 2+ SVG edges
          const touchesLeft   = bbox.x < EDGE_MARGIN;
          const touchesTop    = bbox.y < EDGE_MARGIN;
          const touchesRight  = bbox.x + bbox.width > svgW - EDGE_MARGIN;
          const touchesBottom = bbox.y + bbox.height > svgH - EDGE_MARGIN;
          const edgesTouched = [touchesLeft, touchesTop, touchesRight, touchesBottom].filter(Boolean).length;
          if (edgesTouched >= 2) {
            el.setAttribute('data-border', 'true');
            return;
          }
          const fallbackId = el.getAttribute('data-section-id');
          candidates.push({
            id: fallbackId || `seg-${idx}`,
            fallbackId,
            el,
            cx: bbox.x + bbox.width / 2,
            cy: bbox.y + bbox.height / 2,
            w: bbox.width,
            h: bbox.height,
            canvasH: svgH,
          });
        } catch { /* getBBox can fail */ }
      });

      const orderedCandidates = getStableSectionOrder(candidates);
      orderedCandidates.forEach((candidate, index) => {
        const derivedSectionNum = index + 1;
        const canonicalId = `sec-${derivedSectionNum}`;
        const fallbackId = candidate.fallbackId;
          const matchedId =
            (fallbackId && sections[fallbackId] ? fallbackId : null) ||
            (sections[canonicalId] ? canonicalId : null) ||
            sectionIdByNum[derivedSectionNum] ||
            fallbackId ||
            canonicalId;
          const sectionData = sections[matchedId];
        const displayNum = sectionData?.sectionNum || derivedSectionNum;
        candidate.el.setAttribute('data-section-id', String(matchedId));
        candidate.el.setAttribute('data-canonical-id', canonicalId);
        candidate.el.setAttribute('data-section-num', String(displayNum));
      });

      // --- Step 2: collect all numbered sections ---
      const raw = [];
      const labeled = svgEl.querySelectorAll('[data-section-num]');
      labeled.forEach((el) => {
        const id = el.getAttribute('data-section-id');
        const num = el.getAttribute('data-section-num');
        try {
          const bbox = el.getBBox();
          const anchor = getAnchorForSvgElement(svgEl, el, bbox);
          const area = bbox.width * bbox.height;
          const aspect = Math.max(bbox.width, bbox.height) / Math.max(1, Math.min(bbox.width, bbox.height));
          if (bbox.width < MIN_SEGMENT_SIDE || bbox.height < MIN_SEGMENT_SIDE || area < MIN_SEGMENT_AREA || aspect > MAX_SEGMENT_ASPECT) return;
          raw.push({
            el, id, num,
            cx: bbox.x + bbox.width / 2,
            cy: bbox.y + bbox.height / 2,
            labelX: anchor.x,
            labelY: anchor.y,
            clearancePx: anchor.clearancePx,
            left: bbox.x, top: bbox.y,
            right: bbox.x + bbox.width,
            bottom: bbox.y + bbox.height,
            w: bbox.width, h: bbox.height,
            area: bbox.width * bbox.height,
          });
        } catch { /* getBBox can fail */ }
      });

      // --- Step 3: remove full-canvas background fills ---
      const filtered = raw.filter((s) => {
        if (s.area < svgArea * 0.6) return true;
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

      // --- Step 4: draw labels (one per numbered section) ---
      const labels = filtered.map((s) => ({
        ...s,
        cx: Number.isFinite(s.labelX) ? s.labelX : s.cx,
        cy: Number.isFinite(s.labelY) ? s.labelY : s.cy,
        fontPx: getFittedSectionLabelFontPx(s.num, s.w, s.h, s.clearancePx),
      }));
      const arrangedLabels = spreadSectionLabelPositions(labels);

      arrangedLabels.forEach((s) => {
        // Always track center for highlight/popover (even colored sections)
        const elRect = s.el.getBoundingClientRect();
        centers.push({
          id: s.id,
          num: parseInt(s.num, 10),
          cx: elRect.left + elRect.width / 2 - containerRect.left,
          cy: elRect.top + elRect.height / 2 - containerRect.top,
        });

        const labelX = s.cx;
        const labelY = s.cy;
        const fontSize = s.fontPx;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', fontSize);
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('fill', '#222');
        text.setAttribute('stroke', '#fff');
        text.setAttribute('stroke-width', '1.4');
        text.setAttribute('paint-order', 'stroke');
        text.setAttribute('class', 'cdp-lbl-txt');
        text.style.pointerEvents = 'none';
        text.textContent = s.num;
        svgEl.appendChild(text);
      });

      setSectionCenters(centers);
    });

    return () => cancelAnimationFrame(frame);
  }, [coloredSvgHtml, hasSvg, sections, template?.image_url]);

  // Highlight the selected section in the SVG
  useEffect(() => {
    if (!svgContainerRef.current) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;
    // Remove previous highlights
    svgEl.querySelectorAll('.cdp-highlight').forEach(el => el.remove());
    // Reset previously highlighted paths
    svgEl.querySelectorAll('[data-cdp-highlighted]').forEach(el => {
      el.style.stroke = el.getAttribute('data-orig-stroke') || '';
      el.style.strokeWidth = el.getAttribute('data-orig-stroke-width') || '';
      el.style.filter = '';
      el.removeAttribute('data-cdp-highlighted');
      el.removeAttribute('data-orig-stroke');
      el.removeAttribute('data-orig-stroke-width');
    });
    if (!highlightedSection) return;

    const target = svgEl.querySelector(`[data-section-id="${highlightedSection}"]`);
    if (!target) {
      return;
    }
    try {
      // Highlight the actual path/shape by changing its stroke
      target.setAttribute('data-cdp-highlighted', 'true');
      target.setAttribute('data-orig-stroke', target.style.stroke || target.getAttribute('stroke') || '');
      target.setAttribute('data-orig-stroke-width', target.style.strokeWidth || target.getAttribute('stroke-width') || '');
      target.style.stroke = '#4169e1';
      target.style.strokeWidth = '3';
      target.style.filter = 'drop-shadow(0 0 4px rgba(65, 105, 225, 0.6))';

      // Also add a semi-transparent fill overlay clone for extra visibility
      const bbox = target.getBBox();
      const pad = 3;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', bbox.x - pad);
      rect.setAttribute('y', bbox.y - pad);
      rect.setAttribute('width', bbox.width + pad * 2);
      rect.setAttribute('height', bbox.height + pad * 2);
      rect.setAttribute('rx', '2');
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#4169e1');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('stroke-dasharray', '6 3');
      rect.setAttribute('class', 'cdp-highlight');
      rect.style.pointerEvents = 'none';
      rect.style.animation = 'cdp-pulse 1.2s ease-in-out infinite';
      svgEl.appendChild(rect);

      // Inject keyframes if not already present
      if (!document.getElementById('cdp-pulse-keyframes')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'cdp-pulse-keyframes';
        styleSheet.textContent = `
          @keyframes cdp-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `;
        document.head.appendChild(styleSheet);
      }
    } catch { /* getBBox can fail */ }
  }, [highlightedSection, coloredSvgHtml]);

  // Handle click on SVG section
  const handleSvgClick = (e) => {
    const el = e.target.closest('[data-section-id]');
    if (!el) { setPopover(null); setHighlightedSection(null); return; }
    const sectionId = el.getAttribute('data-section-id');
    const sectionNum = Number(el.getAttribute('data-section-num')) || null;
    const data = sections[sectionId] || {};
    if (!sections[sectionId] && isEditingEnabled) {
      setActiveSectionMeta({ id: sectionId, num: sectionNum });
      setEditColor('#98fb98');
    }
    if (data?.color) setEditColor(data.color);

    const containerRect = svgContainerRef.current.getBoundingClientRect();
    setHighlightedSection(sectionId);
    setActiveSectionMeta({ id: sectionId, num: sectionNum || data?.sectionNum || null });
    setPopover({
      sectionId,
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
      color: data.color || '#cccccc',
      glassType: data.glassType,
      glassTypeId: data.glassTypeId,
    });
  };

  const sectionEntries = Object.entries(sections);
  const hasSections = sectionEntries.length > 0;

  // Build display number map: section key → display number
  // Priority: saved sectionNum > center num > raw key
  const sectionNumMap = useMemo(() => {
    const map = {};
    sectionEntries.forEach(([id, data], idx) => {
      const center = sectionCenters.find(c => c.id === id);
      const numericId = Number(id);
      // data.sectionNum is the authoritative number from the designer
      map[id] = data.sectionNum || center?.num || Number((id.match(/^sec-(\d+)$/) || [])[1]) || (Number.isFinite(numericId) ? numericId : null) || (idx + 1);
    });
    return map;
  }, [sectionEntries, sectionCenters]);

  const resolveRenderableSectionId = (sectionId) => {
    const displayNum = sectionNumMap[sectionId];
    const byExact = sectionCenters.find(c => c.id === sectionId);
    if (byExact) return byExact.id;
    const byNum = sectionCenters.find(c => c.num === Number(displayNum));
    return byNum?.id || sectionId;
  };

  if (showEditableSvgGuard) {
    return (
      <div className={styles.container}>
        <div className={styles.guardBox}>
          <h4 className={styles.guardTitle}>Editable revisions require an SVG template</h4>
          <p className={styles.guardText}>
            This work order does not include SVG data, so admin editing cannot be enabled.
          </p>
          <p className={styles.guardText}>No raster/image fallback is shown in admin edit mode.</p>
        </div>
      </div>
    );
  }

  // ----- Non-SVG preview (non-editable contexts only) -----
  if (!hasSvg) {
    return (
      <div className={styles.container}>
        {showExportBar && (
          <div className={styles.exportBar}>
            <button className={styles.exportButton} onClick={handleDownloadSvg} disabled={!hasSvg}>Download SVG</button>
            <button className={styles.exportButton} onClick={handleDownloadPng}>Download PNG</button>
            <button className={styles.exportButton} onClick={handleDownloadJpeg}>Download JPEG</button>
            <button className={styles.exportButton} onClick={handleDownloadPdf}>Download PDF</button>
            <button className={styles.exportButton} onClick={handlePrint}>Send to Printer</button>
          </div>
        )}
        <div className={styles.noPreview}>No SVG preview available</div>
        {hasSections && (
          <div className={styles.sectionList}>
            <h4 className={styles.sectionListTitle}>Section Details</h4>
            <div className={styles.sectionGrid}>
              {sectionEntries.map(([id, data], idx) => (
                <div key={id} className={styles.sectionItem}>
                    <span className={styles.sectionNumber}>{sectionNumMap[id] || data.sectionNum || idx + 1}</span>
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
      {editable && locked && (
        <div className={styles.lockedNotice}>Final revision is locked. Editing is disabled.</div>
      )}
      {(showExportBar || (editable && locked)) && (
        <div className={styles.exportBar}>
          <button className={styles.exportButton} onClick={handleDownloadSvg} disabled={!hasSvg}>Download SVG</button>
          <button className={styles.exportButton} onClick={handleDownloadPng}>Download PNG</button>
          <button className={styles.exportButton} onClick={handleDownloadJpeg}>Download JPEG</button>
          <button className={styles.exportButton} onClick={handleDownloadPdf}>Download PDF</button>
          <button className={styles.exportButton} onClick={handlePrint}>Send to Printer</button>
        </div>
      )}
      {isEditingEnabled && (
        <div className={styles.editorBar}>
          <span className={styles.editorTitle}>
            {activeSectionMeta?.num ? `Editing Section #${activeSectionMeta.num}` : 'Select a section to edit'}
          </span>
          <input
            type="color"
            value={editColor}
            onChange={(e) => setEditColor(e.target.value)}
            className={styles.colorPicker}
            disabled={!activeSectionMeta}
          />
          <button
            className={styles.applyButton}
            disabled={!activeSectionMeta || savingDesign}
            onClick={async () => {
              if (!activeSectionMeta) return;
              const existing = sections[activeSectionMeta.id] || {};
              const nextSections = {
                ...sections,
                [activeSectionMeta.id]: {
                  ...existing,
                  color: editColor,
                  sectionNum: existing.sectionNum || activeSectionMeta.num || null,
                },
              };
              setWorkingSections(nextSections);
              await persistSections(nextSections);
            }}
          >
            {savingDesign ? 'Saving...' : 'Apply Color'}
          </button>
        </div>
      )}
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
          <button className={styles.popoverClose} onClick={() => { setPopover(null); setHighlightedSection(null); }}>&times;</button>
          <div className={styles.popoverHeader}>
            Section #{sectionNumMap[popover.sectionId] || popover.sectionId}
          </div>
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
          <h4 className={styles.sectionListTitle}>Section Details</h4>
          <div className={styles.sectionGrid}>
            {sectionEntries.map(([id, data]) => {
              const displayNum = sectionNumMap[id] || id;
              const renderableId = resolveRenderableSectionId(id);
              return (
                <div
                  key={id}
                  className={`${styles.sectionItem} ${highlightedSection === renderableId ? styles.sectionItemActive : ''}`}
                  onClick={() => {
                    setHighlightedSection(renderableId);
                    if (isEditingEnabled) {
                      setActiveSectionMeta({ id: renderableId, num: Number(displayNum) || null });
                      if (data?.color) setEditColor(data.color);
                    }
                    const center = sectionCenters.find(c => c.id === renderableId);
                    if (center) {
                      setPopover({
                        sectionId: renderableId,
                        x: center.cx,
                        y: center.cy,
                        color: data.color,
                        glassType: data.glassType,
                        glassTypeId: data.glassTypeId,
                      });
                    }
                    // Scroll the SVG preview into view
                    svgContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  onMouseEnter={() => setHighlightedSection(renderableId)}
                  onMouseLeave={() => setHighlightedSection(null)}
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
