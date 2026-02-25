import React, { useState, useEffect, useRef, useCallback } from 'react';
import api, { getTemplates, saveProject, submitWorkOrder } from '../services/api';
import useCustomerAuth from '../hooks/useCustomerAuth';
import styles from './DesignerPage.module.css';

const STEP = { GALLERY: 'gallery', DESIGN: 'design' };

// Color palette for click-to-fill coloring book experience
const QUICK_COLORS = [
  // Reds / Pinks
  '#e63946', '#ff6b6b', '#ff9e7a', '#ffb6c1',
  // Oranges / Yellows
  '#f4a261', '#ffd700', '#f4e04d', '#ffeaa7',
  // Greens
  '#2a9d8f', '#52b788', '#90ee90', '#98fb98',
  // Blues
  '#1d3557', '#457b9d', '#87ceeb', '#add8e6',
  // Purples
  '#7b2d8b', '#9b5de5', '#dda0dd', '#b8b8ff',
  // Browns / Warm Neutrals
  '#8b4513', '#c8a96e', '#d4c5a9', '#e8d5b7',
  // Glass Classics
  '#a0c4c7', '#6b8e8b', '#c9a84c', '#4a2e0a',
  // B&W
  '#ffffff', '#cccccc', '#888888', '#222222',
];

export default function DesignerPage() {
  const [step, setStep] = useState(STEP.GALLERY);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);

  // Canvas
  const canvasRef = useRef(null);          // <canvas> element for Fabric / flood-fill
  const fabricRef = useRef(null);          // Fabric.Canvas instance (SVG mode only)
  const floodCanvasRef = useRef(null);     // offscreen 2D canvas for flood-fill (image mode)
  const floodCtxRef = useRef(null);        // 2D context of the offscreen canvas
  const isFloodFillMode = useRef(false);   // true when using image-template flood fill
  // Line preservation for image templates
  const lineMaskRef = useRef(null);         // Uint8Array — 1 = line pixel, 0 = fillable
  const initialImageRef = useRef(null);     // ImageData snapshot of clean artwork lines
  // Region map: Int32Array where each pixel stores its region number (0 = line)
  const regionMapRef = useRef(null);
  // regionPixels: Map<regionId, number[]> — list of pixel indices per region
  const regionPixelsRef = useRef(null);
  const [selectedObj, setSelectedObj] = useState(null);
  const [selectedColor, setSelectedColor] = useState('#c8a96e');
  // Ref so canvas event handlers (stale closures) always read the current color
  const selectedColorRef = useRef('#c8a96e');
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);

  // Glass types
  const [glassTypes, setGlassTypes] = useState([]);
  const [activeGlassType, setActiveGlassType] = useState(null);
  const activeGlassTypeRef = useRef(null);
  useEffect(() => { activeGlassTypeRef.current = activeGlassType; }, [activeGlassType]);
  const colorToolBoxRef = useRef(null);
  const [syncedToolBoxHeight, setSyncedToolBoxHeight] = useState(null);
  // Preloaded texture images keyed by glass type id
  const textureCacheRef = useRef(new Map());

  // History (undo/redo)
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);

  // Save / submit
  const [projectId, setProjectId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitModal, setSubmitModal] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    notes: '', timeline: '', budget: '', contact: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const { customerToken } = useCustomerAuth();

  // ── Load templates ───────────────────────────────────────────
  useEffect(() => {
    setTemplatesLoading(true);
    getTemplates()
      .then(res => {
        const items = res?.items || res || [];
        setTemplates(Array.isArray(items) ? items : []);
        const cats = [...new Set(items.map(t => t.category).filter(Boolean))];
        setCategories(cats);
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  // ── Load glass types when entering design step ───────────────
  useEffect(() => {
    if (step !== STEP.DESIGN) return;
    api.get('/glass-types')
      .then(res => {
        const items = res?.items || res || [];
        setGlassTypes(items);
        // Preload texture images into cache
        items.forEach(gt => {
          if (gt.texture_url && !textureCacheRef.current.has(gt.id)) {
            // Handle relative URLs by prepending backend URL
            const textureUrl = gt.texture_url.startsWith('http')
              ? gt.texture_url
              : `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000'}${gt.texture_url}`;
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              textureCacheRef.current.set(gt.id, img);
              console.log('[DesignerPage] Loaded glass texture:', gt.name, textureUrl);
            };
            img.onerror = () => console.error('[DesignerPage] Failed to load glass texture:', gt.name, textureUrl);
            img.src = textureUrl;
          }
        });
      })
      .catch(() => setGlassTypes([]));
  }, [step]);

  useEffect(() => {
    if (step !== STEP.DESIGN) return;
    const target = colorToolBoxRef.current;
    if (!target) return;

    const syncHeight = () => {
      if (!target) return;
      setSyncedToolBoxHeight(target.offsetHeight || null);
    };

    syncHeight();

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncHeight());
      observer.observe(target);
    }
    window.addEventListener('resize', syncHeight);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, [step, selectedObj, glassTypes.length, activeGlassType]);

  // ── Push canvas state to history ─────────────────────────────
  const pushHistory = useCallback((canvas) => {
    const json = canvas.toJSON();
    const arr = historyRef.current.slice(0, historyIdxRef.current + 1);
    arr.push(json);
    historyRef.current = arr;
    historyIdxRef.current = arr.length - 1;
  }, []);

  // ── Initialize canvas ──────────────────────────────────────────
  useEffect(() => {
    if (step !== STEP.DESIGN || !canvasRef.current || !selectedTemplate) return;

    console.log('[DesignerPage] Initializing canvas with template:', selectedTemplate);
    console.log('[DesignerPage] Template type:', selectedTemplate.template_type);
    console.log('[DesignerPage] Has svg_content:', !!selectedTemplate.svg_content);
    console.log('[DesignerPage] Has image_url:', !!selectedTemplate.image_url);

    let destroyed = false;
    isFloodFillMode.current = false;

    // ── Flood-fill helpers (for image / PDF templates) ────────────
    // Build a region map: connected components of non-line pixels.
    // Returns { regionMap: Int32Array, regionPixels: Map<id, number[]> }
    function buildRegionMap(mask, w, h) {
      const regionMap = new Int32Array(w * h); // 0 = unassigned / line
      const regionPixels = new Map();
      let nextId = 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pi = y * w + x;
          if (regionMap[pi] !== 0 || (mask && mask[pi])) continue;
          // BFS flood from this pixel
          const id = nextId++;
          const pixels = [];
          const queue = [pi];
          regionMap[pi] = id;
          while (queue.length > 0) {
            const cur = queue.pop();
            pixels.push(cur);
            const cx = cur % w;
            const cy = (cur - cx) / w;
            const neighbors = [];
            if (cx > 0)     neighbors.push(cur - 1);
            if (cx < w - 1) neighbors.push(cur + 1);
            if (cy > 0)     neighbors.push(cur - w);
            if (cy < h - 1) neighbors.push(cur + w);
            for (const ni of neighbors) {
              if (regionMap[ni] !== 0) continue;
              if (mask && mask[ni]) continue;
              regionMap[ni] = id;
              queue.push(ni);
            }
          }
          regionPixels.set(id, pixels);
        }
      }
      return { regionMap, regionPixels };
    }

    // Fill all pixels belonging to a region with a flat colour
    function fillRegion(ctx, regionId, fillR, fillG, fillB, w, h) {
      const pixels = regionPixelsRef.current?.get(regionId);
      if (!pixels || pixels.length === 0) return;
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (const pi of pixels) {
        const ci = pi * 4;
        data[ci]     = fillR;
        data[ci + 1] = fillG;
        data[ci + 2] = fillB;
        data[ci + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    // Fill one region with a bevel edge that follows that region's boundary
    // (used in flood-fill mode for Beveled glass types)
    function fillRegionBeveled(ctx, regionId, color, w, h) {
      const pixels = regionPixelsRef.current?.get(regionId);
      if (!pixels || pixels.length === 0) return;

      const [baseR, baseG, baseB] = hexToRgb(color);
      const regionMap = regionMapRef.current;
      if (!regionMap) return;

      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (const pi of pixels) {
        const x = pi % w;
        const y = (pi - x) / w;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      const bboxW = Math.max(1, maxX - minX);
      const bboxH = Math.max(1, maxY - minY);
      const bevelDepth = Math.max(3, Math.min(14, Math.round(Math.min(bboxW, bboxH) * 0.12)));

      const dist = new Int16Array(w * h);
      dist.fill(-1);
      const queue = [];

      for (const pi of pixels) {
        const x = pi % w;
        const y = (pi - x) / w;
        let edge = false;
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
          edge = true;
        } else {
          const left = pi - 1;
          const right = pi + 1;
          const up = pi - w;
          const down = pi + w;
          if (regionMap[left] !== regionId || regionMap[right] !== regionId || regionMap[up] !== regionId || regionMap[down] !== regionId) {
            edge = true;
          }
        }
        if (edge) {
          dist[pi] = 0;
          queue.push(pi);
        }
      }

      for (let q = 0; q < queue.length; q += 1) {
        const cur = queue[q];
        const curDist = dist[cur];
        if (curDist >= bevelDepth) continue;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx > 0) {
          const ni = cur - 1;
          if (regionMap[ni] === regionId && dist[ni] === -1) {
            dist[ni] = curDist + 1;
            queue.push(ni);
          }
        }
        if (cx < w - 1) {
          const ni = cur + 1;
          if (regionMap[ni] === regionId && dist[ni] === -1) {
            dist[ni] = curDist + 1;
            queue.push(ni);
          }
        }
        if (cy > 0) {
          const ni = cur - w;
          if (regionMap[ni] === regionId && dist[ni] === -1) {
            dist[ni] = curDist + 1;
            queue.push(ni);
          }
        }
        if (cy < h - 1) {
          const ni = cur + w;
          if (regionMap[ni] === regionId && dist[ni] === -1) {
            dist[ni] = curDist + 1;
            queue.push(ni);
          }
        }
      }

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      for (const pi of pixels) {
        const x = pi % w;
        const y = (pi - x) / w;
        const ci = pi * 4;

        let r = baseR;
        let g = baseG;
        let b = baseB;

        const d = dist[pi];
        if (d >= 0 && d <= bevelDepth) {
          const edgeStrength = 1 - (d / (bevelDepth + 1));
          const falloff = edgeStrength * edgeStrength;
          const edgeShadow = Math.round(90 * falloff);
          r = Math.max(0, Math.min(255, baseR - edgeShadow));
          g = Math.max(0, Math.min(255, baseG - edgeShadow));
          b = Math.max(0, Math.min(255, baseB - edgeShadow));
        }

        data[ci] = r;
        data[ci + 1] = g;
        data[ci + 2] = b;
        data[ci + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
    }

    // Apply a textured fill to a specific region
    function fillRegionTextured(ctx, regionId, color, textureImg, w, h) {
      const pixels = regionPixelsRef.current?.get(regionId);
      if (!pixels || pixels.length === 0) return;
      // 1. Build a mask canvas for this region
      const maskCvs = document.createElement('canvas');
      maskCvs.width = w; maskCvs.height = h;
      const maskCtx = maskCvs.getContext('2d');
      const maskImg = maskCtx.createImageData(w, h);
      const mPx = maskImg.data;
      for (const pi of pixels) {
        const ci = pi * 4;
        mPx[ci] = mPx[ci+1] = mPx[ci+2] = mPx[ci+3] = 255;
      }
      maskCtx.putImageData(maskImg, 0, 0);
      // 2. Textured fill (grayscale texture so only detail transfers, not colour)
      const gsTex = grayscaleTiledTexture(textureImg, w, h);
      const texCvs = document.createElement('canvas');
      texCvs.width = w; texCvs.height = h;
      const texCtx = texCvs.getContext('2d');
      texCtx.fillStyle = color;
      texCtx.fillRect(0, 0, w, h);
      texCtx.globalCompositeOperation = 'multiply';
      texCtx.drawImage(gsTex, 0, 0);
      texCtx.globalCompositeOperation = 'soft-light';
      texCtx.globalAlpha = 0.45;
      texCtx.drawImage(gsTex, 0, 0);
      texCtx.globalAlpha = 1;
      texCtx.globalCompositeOperation = 'destination-in';
      texCtx.drawImage(maskCvs, 0, 0);
      texCtx.globalCompositeOperation = 'source-over';
      // 3. Draw the textured fill onto the main canvas
      ctx.drawImage(texCvs, 0, 0);
    }

    // Restore line pixels from the original artwork after any fill operation
    function restoreLines(ctx, w, h) {
      const mask = lineMaskRef.current;
      const orig = initialImageRef.current;
      if (!mask || !orig) return;
      const cur = ctx.getImageData(0, 0, w, h);
      const px = cur.data;
      const oPx = orig.data;
      for (let i = 0; i < px.length; i += 4) {
        if (mask[i / 4]) {
          px[i]     = oPx[i];
          px[i + 1] = oPx[i + 1];
          px[i + 2] = oPx[i + 2];
          px[i + 3] = oPx[i + 3];
        }
      }
      ctx.putImageData(cur, 0, 0);
    }

    function hexToRgb(hex) {
      const n = parseInt(hex.replace('#', ''), 16);
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }

    // Convert a texture image to grayscale so it contributes only surface detail,
    // not its own colour.  Returns a canvas element usable as a pattern source.
    function grayscaleTexture(img, size) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, size, size);
      const id = g.getImageData(0, 0, size, size);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
        d[i] = d[i+1] = d[i+2] = lum;
      }
      g.putImageData(id, 0, 0);
      return c;
    }

    // Create a tiled grayscale texture canvas at arbitrary width/height
    function grayscaleTiledTexture(img, w, h) {
      // First make a small grayscale tile
      const tileSize = img.naturalWidth || img.width || 120;
      const gsTile = grayscaleTexture(img, tileSize);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const pat = g.createPattern(gsTile, 'repeat');
      g.fillStyle = pat;
      g.fillRect(0, 0, w, h);
      return c;
    }

    // ── Texture blending helpers ──────────────────────────────────
    // Create a canvas tile that combines a flat color with a glass texture image.
    // Texture is converted to grayscale first so it adds only surface detail.
    function createTexturedTile(color, textureImg, tileSize = 120, isBeveled = false) {
      if (isBeveled) {
        // For beveled glass, return null - we'll use a different rendering approach
        return null;
      }
      const gsTex = grayscaleTexture(textureImg, tileSize);
      const tile = document.createElement('canvas');
      tile.width = tileSize;
      tile.height = tileSize;
      const tCtx = tile.getContext('2d');
      // 1) Base: the chosen colour
      tCtx.fillStyle = color;
      tCtx.fillRect(0, 0, tileSize, tileSize);
      // 2) Multiply: grayscale texture darkens the colour naturally
      tCtx.globalCompositeOperation = 'multiply';
      tCtx.drawImage(gsTex, 0, 0, tileSize, tileSize);
      // 3) Soft-light pass at lower opacity for more depth
      tCtx.globalCompositeOperation = 'soft-light';
      tCtx.globalAlpha = 0.45;
      tCtx.drawImage(gsTex, 0, 0, tileSize, tileSize);
      tCtx.globalAlpha = 1;
      tCtx.globalCompositeOperation = 'source-over';
      return tile;
    }

    // Apply beveled effect using inner strokes that only affect edges
    async function applyBeveledEffect(fabricObj, color) {
      // Parse color to RGB
      const hexColor = color.replace('#', '');
      const r = parseInt(hexColor.substr(0, 2), 16);
      const g = parseInt(hexColor.substr(2, 2), 16);
      const b = parseInt(hexColor.substr(4, 2), 16);
      
      // Create lighter and darker versions for bevel effect
      const lighter = `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, 0.8)`;
      const darker = `rgba(${Math.max(0, r - 70)}, ${Math.max(0, g - 70)}, ${Math.max(0, b - 70)}, 0.7)`;
      
      // Get object size for proportional bevel width
      const bounds = fabricObj.getBoundingRect();
      const avgSize = (bounds.width + bounds.height) / 2;
      const strokeWidth = Math.max(4, avgSize * 0.08); // 8% of average dimension
      
      // Set base fill color (no shadow or effects on interior)
      fabricObj.set({
        fill: color,
        stroke: lighter,  // Light stroke on edges
        strokeWidth: strokeWidth,
        strokeLineJoin: 'round',
        strokeLineCap: 'round',
        paintFirst: 'fill', // Fill first, then stroke on top
        shadow: null // Remove any shadow
      });
      
      // Store bevel data
      fabricObj._hasBevel = true;
      fabricObj._bevelColor = color;
      
      return fabricObj;
    }

    // After a flood-fill, overlay the glass texture on only the pixels that changed.
    // Uses the same multiply + soft-light composite as SVG-mode tiles for consistency.
    // (Kept for fillAll which does a bulk pixel rewrite)
    function applyTextureOverFlood(ctx, beforeData, w, h, textureImg, fillColor) {
      const afterData = ctx.getImageData(0, 0, w, h);
      const bPx = beforeData.data;
      const aPx = afterData.data;

      // 1. Build a mask of the pixels that the flood-fill changed
      const maskCvs = document.createElement('canvas');
      maskCvs.width = w; maskCvs.height = h;
      const maskCtx = maskCvs.getContext('2d');
      const maskImg = maskCtx.createImageData(w, h);
      const mPx = maskImg.data;
      for (let i = 0; i < aPx.length; i += 4) {
        if (bPx[i] !== aPx[i] || bPx[i+1] !== aPx[i+1] || bPx[i+2] !== aPx[i+2]) {
          mPx[i] = mPx[i+1] = mPx[i+2] = mPx[i+3] = 255;
        }
      }
      maskCtx.putImageData(maskImg, 0, 0);

      // 2. Create textured fill at canvas size (same blend as createTexturedTile)
      const texCvs = document.createElement('canvas');
      texCvs.width = w; texCvs.height = h;
      const texCtx = texCvs.getContext('2d');
      texCtx.fillStyle = fillColor;
      texCtx.fillRect(0, 0, w, h);
      texCtx.globalCompositeOperation = 'multiply';
      const pat = texCtx.createPattern(textureImg, 'repeat');
      texCtx.fillStyle = pat;
      texCtx.fillRect(0, 0, w, h);
      texCtx.globalCompositeOperation = 'soft-light';
      texCtx.globalAlpha = 0.45;
      texCtx.fillStyle = pat;
      texCtx.fillRect(0, 0, w, h);
      texCtx.globalAlpha = 1;
      texCtx.globalCompositeOperation = 'source-over';

      // 3. Clip textured canvas to only the flood-filled region
      texCtx.globalCompositeOperation = 'destination-in';
      texCtx.drawImage(maskCvs, 0, 0);
      texCtx.globalCompositeOperation = 'source-over';

      // 4. Composite: restore pre-flood state, then draw the textured fill on top
      ctx.putImageData(beforeData, 0, 0);
      ctx.drawImage(texCvs, 0, 0);
    }
    // ── End helpers ───────────────────────────────────────────────

    (async () => {
      try {
        const templateType = selectedTemplate.template_type || 'svg';
        const CANVAS_W = 700;
        const CANVAS_H = 500;

        // ============================================================
        //  IMAGE / PDF TEMPLATE  →  flood-fill on a plain 2D canvas
        // ============================================================
        if (templateType === 'image' && selectedTemplate.image_url) {
          isFloodFillMode.current = true;

          const origin = window.location.hostname === 'localhost'
            ? `${window.location.protocol}//localhost:5000`
            : window.location.origin;
          const src = selectedTemplate.image_url.startsWith('http')
            ? selectedTemplate.image_url
            : `${origin}${selectedTemplate.image_url}`;

          // Load the image
          const imgEl = await new Promise((resolve, reject) => {
            const el = document.createElement('img');
            el.crossOrigin = 'anonymous';
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = src;
          }).catch(() => null);
          if (destroyed || !imgEl) return;

          // Set up the visible canvas for direct 2D drawing
          const cvs = canvasRef.current;
          cvs.width = CANVAS_W;
          cvs.height = CANVAS_H;
          const ctx = cvs.getContext('2d');

          // Fill background
          ctx.fillStyle = '#f8f4ef';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

          // Draw image scaled to fit
          const scale = Math.min(CANVAS_W / imgEl.naturalWidth, CANVAS_H / imgEl.naturalHeight) * 0.97;
          const drawW = imgEl.naturalWidth * scale;
          const drawH = imgEl.naturalHeight * scale;
          const offsetX = (CANVAS_W - drawW) / 2;
          const offsetY = (CANVAS_H - drawH) / 2;
          ctx.drawImage(imgEl, offsetX, offsetY, drawW, drawH);

          floodCtxRef.current = ctx;

          // ── Build line mask: any pixel ≠ background is part of the artwork ──
          const initSnap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
          const iData = initSnap.data;
          // Background colour we painted: #f8f4ef → 248, 244, 239
          const BG_R = 248, BG_G = 244, BG_B = 239;
          const mask = new Uint8Array(CANVAS_W * CANVAS_H);
          for (let i = 0; i < iData.length; i += 4) {
            const dr = Math.abs(iData[i]     - BG_R);
            const dg = Math.abs(iData[i + 1] - BG_G);
            const db = Math.abs(iData[i + 2] - BG_B);
            if (dr > 20 || dg > 20 || db > 20) {
              mask[i / 4] = 1; // artwork / line pixel
            }
          }
          lineMaskRef.current = mask;
          // Deep-copy so the original pixel data is never mutated
          const origCopy = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
          initialImageRef.current = origCopy;

          // ── Build numbered region map (connected components of non-line pixels) ──
          const { regionMap, regionPixels } = buildRegionMap(mask, CANVAS_W, CANVAS_H);
          regionMapRef.current = regionMap;
          regionPixelsRef.current = regionPixels;

          // Save initial state for undo
          historyRef.current = [ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)];
          historyIdxRef.current = 0;

          // Click handler — region-based fill (always fills entire section)
          const handleClick = (e) => {
            const rect = cvs.getBoundingClientRect();
            const scaleX = cvs.width / rect.width;
            const scaleY = cvs.height / rect.height;
            const x = Math.round((e.clientX - rect.left) * scaleX);
            const y = Math.round((e.clientY - rect.top) * scaleY);
            if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) return;
            const rMap = regionMapRef.current;
            if (!rMap) return;
            const regionId = rMap[y * CANVAS_W + x];
            if (regionId === 0) return; // clicked a line pixel
            const color = selectedColorRef.current;
            const [r, g, b] = hexToRgb(color);
            const gt = activeGlassTypeRef.current;
            const texImg = gt ? textureCacheRef.current.get(gt.id) : null;
            const isBeveled = !!(gt && (gt.name || '').toLowerCase().includes('bevel'));
            // Fill the entire region with flat colour first
            if (isBeveled) {
              fillRegionBeveled(ctx, regionId, color, CANVAS_W, CANVAS_H);
            } else {
              fillRegion(ctx, regionId, r, g, b, CANVAS_W, CANVAS_H);
            }
            // Then overlay texture if a non-beveled glass type is selected
            if (texImg && !isBeveled) {
              fillRegionTextured(ctx, regionId, color, texImg, CANVAS_W, CANVAS_H);
            }
            // Restore line pixels so outlines always stay original
            restoreLines(ctx, CANVAS_W, CANVAS_H);
            // Push undo state
            const snap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
            const arr = historyRef.current.slice(0, historyIdxRef.current + 1);
            arr.push(snap);
            historyRef.current = arr;
            historyIdxRef.current = arr.length - 1;
            setSelectedObj({
              fill: color,
              glassType: gt?.name || null,
            });
          };
          cvs.addEventListener('click', handleClick);

          // Store cleanup ref
          fabricRef.current = { _floodCleanup: () => cvs.removeEventListener('click', handleClick) };
          return;
        }

        // ============================================================
        //  SVG TEMPLATE  →  Fabric.js with ungrouped paths
        // ============================================================
        console.log('[DesignerPage] Loading Fabric.js for SVG template');
        const fabric = await import('fabric');
        const { Canvas, loadSVGFromString, util, Rect } = fabric;

        console.log('[DesignerPage] Creating Fabric canvas');
        const canvas = new Canvas(canvasRef.current, {
          width: CANVAS_W,
          height: CANVAS_H,
          backgroundColor: '#f8f4ef',
          selection: false,
          perPixelTargetFind: true,
        });
        if (destroyed) { canvas.dispose(); return; }
        fabricRef.current = canvas;

        if (selectedTemplate.svg_content) {
          console.log('[DesignerPage] Parsing SVG content...');
          // Parse SVG string into Fabric objects
          let rawObjects = [];
          let svgOptions = {};
          try {
            const result = await loadSVGFromString(selectedTemplate.svg_content);
            rawObjects = (result.objects || []).filter(Boolean);
            svgOptions = result.options || {};
            console.log('[DesignerPage] SVG parsed successfully:', rawObjects.length, 'objects');
          } catch (e) {
            console.error('[DesignerPage] SVG parse error:', e);
          }

          if (rawObjects.length === 0) {
            console.warn('No objects parsed from SVG');
          } else {
            // Build group to get correct SVG bounding box + transforms
            const group = util.groupSVGElements
              ? util.groupSVGElements(rawObjects, svgOptions)
              : null;

            const gW = group?.width  || svgOptions.width  || svgOptions.viewBoxWidth  || 500;
            const gH = group?.height || svgOptions.height || svgOptions.viewBoxHeight || 500;
            const scaleF = Math.min(CANVAS_W / gW, CANVAS_H / gH) * 0.97;

            if (group) {
              // CRITICAL: apply the scale to the group BEFORE computing child transforms
              group.set({
                left:    CANVAS_W / 2,
                top:     CANVAS_H / 2,
                originX: 'center',
                originY: 'center',
                scaleX:  scaleF,
                scaleY:  scaleF,
              });
              group.setCoords();
            }

            const strokeW = Math.max(0.5, 1.5 / scaleF);

            // Helper: detect if a fill colour is very dark (outline / leading)
            function isOutlineFill(fill) {
              if (!fill || fill === 'none' || fill === '' || fill === 'transparent') return true;
              if (typeof fill !== 'string') return false;
              let r, g, b;
              if (fill.startsWith('#')) {
                const hex = fill.replace('#', '');
                const full = hex.length === 3
                  ? hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]
                  : hex;
                r = parseInt(full.substring(0, 2), 16);
                g = parseInt(full.substring(2, 4), 16);
                b = parseInt(full.substring(4, 6), 16);
              } else if (fill === 'black') {
                r = g = b = 0;
              } else {
                return false; // can't parse – treat as a section
              }
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              return lum < 30; // very dark → outline
            }

            // Recursively collect every leaf (non-group) object
            const collectLeaves = (obj) => {
              if (!obj) return [];
              if (obj.type === 'group' || obj.type === 'Group') {
                return (obj._objects || []).flatMap(collectLeaves);
              }
              return [obj];
            };

            const leaves = group
              ? (group._objects || []).flatMap(collectLeaves)
              : rawObjects.flatMap(collectLeaves);

            leaves.forEach((child) => {
              // absoluteMatrix = groupMatrix × childLocalMatrix
              let finalLeft, finalTop, finalScaleX, finalScaleY, finalAngle;
              try {
                const groupMatrix = group ? group.calcTransformMatrix() : [scaleF, 0, 0, scaleF, CANVAS_W / 2, CANVAS_H / 2];
                const childMatrix = child.calcTransformMatrix();
                const abs = util.multiplyTransformMatrices(groupMatrix, childMatrix);
                const d   = util.qrDecompose(abs);
                finalLeft   = d.translateX;
                finalTop    = d.translateY;
                finalScaleX = d.scaleX;
                finalScaleY = d.scaleY;
                finalAngle  = d.angle;
              } catch (_) {
                // Fallback: manual scale + center
                const ox = (CANVAS_W - gW * scaleF) / 2;
                const oy = (CANVAS_H - gH * scaleF) / 2;
                finalLeft   = (child.left || 0) * scaleF + ox + (child.width || 0) * scaleF / 2;
                finalTop    = (child.top  || 0) * scaleF + oy + (child.height || 0) * scaleF / 2;
                finalScaleX = (child.scaleX || 1) * scaleF;
                finalScaleY = (child.scaleY || 1) * scaleF;
                finalAngle  = child.angle || 0;
              }

              // Remove child from group so Fabric doesn't try to manage it as a nested object
              if (child.group) { delete child.group; }

              // Determine if this path is an outline / leading line (should stay black)
              const origFill = child.fill;
              const outline = isOutlineFill(origFill);

              child.set({
                left:   finalLeft,
                top:    finalTop,
                scaleX: finalScaleX,
                scaleY: finalScaleY,
                angle:  finalAngle,
                originX: 'center',
                originY: 'center',
                flipX: false, flipY: false,
                // Outlines: locked & clicks pass through to glass section below
                selectable: !outline,
                evented:    !outline,
                hasControls: false,
                hasBorders: false,
                hoverCursor: outline ? 'default' : 'pointer',
                perPixelTargetFind: true,
                objectCaching: false,
                fill:   outline
                  ? (origFill && origFill !== 'none' ? origFill : 'transparent')
                  : (origFill && origFill !== 'none' ? origFill : '#d4c5a9'),
                stroke: '#000',      // strokes always black
                strokeWidth:   strokeW,
                strokeUniform: true,
              });
              child.setCoords();
              canvas.add(child);
            });
            console.log('[DesignerPage] Added', leaves.length, 'objects to canvas');
          }
        } else {
          console.log('[DesignerPage] No svg_content, creating demo rectangles');
          // Demo: colorful placeholder rectangles
          const demoColors = ['#c8a96e','#a0c8e0','#e8d5b7','#90ee90','#ffb6c1','#f4e04d','#dda0dd'];
          const cols = 4; const rows = 3;
          const w = 155; const h = 148;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const rect = new Rect({
                left: 20 + c * (w + 8),
                top:  20 + r * (h + 8),
                width: w, height: h,
                fill: demoColors[(r * cols + c) % demoColors.length],
                stroke: '#4a2e0a',
                strokeWidth: 2,
                selectable: true,
                hasControls: false,
                hoverCursor: 'pointer',
              });
              canvas.add(rect);
            }
          }
          console.log('[DesignerPage] Added demo rectangles');
        }

        console.log('[DesignerPage] Rendering canvas...');
        canvas.renderAll();
        console.log('[DesignerPage] Canvas rendered');
        pushHistory(canvas);

        // ── Coloring-book click-to-fill (SVG mode) ──────────────────
        canvas.on('mouse:down', async (e) => {
          const hit = e.target;
          if (!hit || hit.selectable === false) return;
          const color = selectedColorRef.current;
          const gt = activeGlassTypeRef.current;
          const texImg = gt ? textureCacheRef.current.get(gt.id) : null;
          
          // Check if this is beveled glass (by name)
          const isBeveled = gt && (gt.name || '').toLowerCase().includes('bevel');
          
          if (isBeveled) {
            // Apply beveled edge effect that follows shape boundaries
            await applyBeveledEffect(hit, color);
          } else if (texImg) {
            // Create a colour + texture tile and use it as a repeating pattern
            const tile = createTexturedTile(color, texImg);
            const { Pattern } = await import('fabric');
            const pattern = new Pattern({ source: tile, repeat: 'repeat' });
            hit.set('fill', pattern);
          } else {
            hit.set('fill', color);
          }
          hit._glassType = gt?.name || null;
          hit._fillColor = color; // remember the base colour for display
          hit.dirty = true;
          canvas.requestRenderAll();
          setSelectedObj({ fill: color, glassType: hit._glassType });
          pushHistory(canvas);
        });
      } catch (err) {
        console.error('[DesignerPage] Canvas initialization error:', err);
        console.error('[DesignerPage] Error stack:', err.stack);
      }
    })();

    return () => {
      destroyed = true;
      if (fabricRef.current) {
        if (fabricRef.current._floodCleanup) {
          fabricRef.current._floodCleanup();
        } else if (fabricRef.current.dispose) {
          fabricRef.current.dispose();
        }
        fabricRef.current = null;
      }
      floodCtxRef.current = null;
      lineMaskRef.current = null;
      initialImageRef.current = null;
      regionMapRef.current = null;
      regionPixelsRef.current = null;
      isFloodFillMode.current = false;
      setSelectedObj(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedTemplate]);

  // ── Apply glass type ──────────────────────────────────────────
  // Select a glass type (texture); the color picker remains independent.
  // Both glass type + color are applied together when clicking a section.
  const applyGlassType = useCallback((gt) => {
    setActiveGlassType(prev => prev?.id === gt.id ? null : gt); // toggle
  }, []);

  // ── Fill all pieces ───────────────────────────────────────────
  const fillAll = useCallback(async () => {
    if (isFloodFillMode.current) {
      // Region-based fill all: fill every region with selected colour + texture
      const ctx = floodCtxRef.current;
      if (!ctx) return;
      const regionPixels = regionPixelsRef.current;
      if (!regionPixels) return;
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const [fR, fG, fB] = [
        parseInt(selectedColor.substring(1, 3), 16),
        parseInt(selectedColor.substring(3, 5), 16),
        parseInt(selectedColor.substring(5, 7), 16),
      ];
      // Flat-fill all regions at once
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (const [, pixels] of regionPixels) {
        for (const pi of pixels) {
          const ci = pi * 4;
          data[ci] = fR; data[ci+1] = fG; data[ci+2] = fB; data[ci+3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      // Texture overlay if glass type selected
      const gt = activeGlassType;
      const texImg = gt ? textureCacheRef.current.get(gt.id) : null;
      const isBeveled = !!(gt && (gt.name || '').toLowerCase().includes('bevel'));
      if (isBeveled) {
        for (const [regionId] of regionPixels) {
          fillRegionBeveled(ctx, regionId, selectedColor, w, h);
        }
      } else if (texImg) {
        // Build a mask of ALL fillable pixels
        const maskCvs = document.createElement('canvas');
        maskCvs.width = w; maskCvs.height = h;
        const maskCtx = maskCvs.getContext('2d');
        const maskImg = maskCtx.createImageData(w, h);
        const mPx = maskImg.data;
        for (const [, pixels] of regionPixels) {
          for (const pi of pixels) {
            const ci = pi * 4;
            mPx[ci] = mPx[ci+1] = mPx[ci+2] = mPx[ci+3] = 255;
          }
        }
        maskCtx.putImageData(maskImg, 0, 0);
        // Textured fill (grayscale texture)
        const gsTex = grayscaleTiledTexture(texImg, w, h);
        const texCvs = document.createElement('canvas');
        texCvs.width = w; texCvs.height = h;
        const texCtx = texCvs.getContext('2d');
        texCtx.fillStyle = selectedColor;
        texCtx.fillRect(0, 0, w, h);
        texCtx.globalCompositeOperation = 'multiply';
        texCtx.drawImage(gsTex, 0, 0);
        texCtx.globalCompositeOperation = 'soft-light';
        texCtx.globalAlpha = 0.45;
        texCtx.drawImage(gsTex, 0, 0);
        texCtx.globalAlpha = 1;
        texCtx.globalCompositeOperation = 'destination-in';
        texCtx.drawImage(maskCvs, 0, 0);
        texCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(texCvs, 0, 0);
      }
      // Restore line pixels
      const maskR = lineMaskRef.current;
      const origR = initialImageRef.current;
      if (maskR && origR) {
        const cur = ctx.getImageData(0, 0, w, h);
        const px = cur.data;
        const oPx = origR.data;
        for (let i = 0; i < px.length; i += 4) {
          if (maskR[i / 4]) {
            px[i] = oPx[i]; px[i+1] = oPx[i+1];
            px[i+2] = oPx[i+2]; px[i+3] = oPx[i+3];
          }
        }
        ctx.putImageData(cur, 0, 0);
      }
      const snap = ctx.getImageData(0, 0, w, h);
      const arr = historyRef.current.slice(0, historyIdxRef.current + 1);
      arr.push(snap); historyRef.current = arr; historyIdxRef.current = arr.length - 1;
      return;
    }
    const canvas = fabricRef.current;
    if (!canvas) return;
    const gt = activeGlassType;
    const texImg = gt ? textureCacheRef.current.get(gt.id) : null;
    
    // Check if this is beveled glass
    const isBeveled = gt && (gt.name || '').toLowerCase().includes('bevel');
    
    let pattern = null;
    if (isBeveled) {
      // Don't create pattern for beveled glass - will apply border effect instead
      pattern = null;
    } else if (texImg) {
      // Build a colour + texture tile for the pattern (grayscale texture)
      const gsTile = grayscaleTexture(texImg, 120);
      const tile = document.createElement('canvas');
      tile.width = 120; tile.height = 120;
      const tCtx = tile.getContext('2d');
      tCtx.fillStyle = selectedColor;
      tCtx.fillRect(0, 0, 120, 120);
      tCtx.globalCompositeOperation = 'multiply';
      tCtx.drawImage(gsTile, 0, 0, 120, 120);
      tCtx.globalCompositeOperation = 'soft-light';
      tCtx.globalAlpha = 0.45;
      tCtx.drawImage(gsTile, 0, 0, 120, 120);
      tCtx.globalAlpha = 1;
      tCtx.globalCompositeOperation = 'source-over';
      const { Pattern } = await import('fabric');
      pattern = new Pattern({ source: tile, repeat: 'repeat' });
    }
    
    // Apply fill to all objects
    const applyPromises = [];
    const applyFill = async (obj) => {
      if (!obj) return;
      if (obj.type === 'group' || obj.type === 'Group') {
        obj.dirty = true;
        for (const child of (obj._objects || [])) {
          await applyFill(child);
        }
      } else if (obj.selectable !== false) {
        if (isBeveled) {
          await applyBeveledEffect(obj, selectedColor);
        } else {
          obj.set('fill', pattern || selectedColor);
        }
        obj._fillColor = selectedColor;
        obj._glassType = gt?.name || null;
        obj.dirty = true;
      }
    };
    
    for (const obj of canvas.getObjects()) {
      await applyFill(obj);
    }
    
    canvas.requestRenderAll();
    pushHistory(canvas);
  }, [selectedColor, activeGlassType, pushHistory]);

  // ── Undo ──────────────────────────────────────────────────────
  const undo = useCallback(async () => {
    if (isFloodFillMode.current) {
      const ctx = floodCtxRef.current;
      if (!ctx || historyIdxRef.current <= 0) return;
      historyIdxRef.current -= 1;
      ctx.putImageData(historyRef.current[historyIdxRef.current], 0, 0);
      return;
    }
    const canvas = fabricRef.current;
    if (!canvas || historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    await canvas.loadFromJSON(historyRef.current[historyIdxRef.current]);
    canvas.renderAll();
  }, []);

  // ── Redo ──────────────────────────────────────────────────────
  const redo = useCallback(async () => {
    if (isFloodFillMode.current) {
      const ctx = floodCtxRef.current;
      if (!ctx || historyIdxRef.current >= historyRef.current.length - 1) return;
      historyIdxRef.current += 1;
      ctx.putImageData(historyRef.current[historyIdxRef.current], 0, 0);
      return;
    }
    const canvas = fabricRef.current;
    if (!canvas || historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    await canvas.loadFromJSON(historyRef.current[historyIdxRef.current]);
    canvas.renderAll();
  }, []);

  // ── Reset (remove all colour & texture) ───────────────────────
  const resetCanvas = useCallback(async () => {
    if (historyRef.current.length === 0) return;
    if (isFloodFillMode.current) {
      const ctx = floodCtxRef.current;
      if (!ctx) return;
      // Restore the very first (clean) snapshot
      ctx.putImageData(historyRef.current[0], 0, 0);
    } else {
      const canvas = fabricRef.current;
      if (!canvas) return;
      // Restore the original uncoloured SVG state
      await canvas.loadFromJSON(historyRef.current[0]);
      canvas.renderAll();
    }
    // Reset history to only the clean state
    historyRef.current = [historyRef.current[0]];
    historyIdxRef.current = 0;
    setSelectedObj(null);
  }, []);

  // ── Save project ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      let canvasData, previewUrl;
      if (isFloodFillMode.current) {
        const cvs = canvasRef.current;
        previewUrl = cvs ? cvs.toDataURL('image/png') : '';
        canvasData = { floodFill: true, dataUrl: previewUrl };
      } else {
        const canvas = fabricRef.current;
        if (!canvas) { setSaving(false); return; }
        canvasData = canvas.toJSON();
        previewUrl = canvas.toDataURL({ format: 'png', quality: 0.8 });
      }
      const res = await saveProject({
        project_id: projectId || undefined,
        template_id: selectedTemplate?.id || null,
        canvas_data: canvasData,
        preview_url: previewUrl,
        name: selectedTemplate?.name || 'My Design',
      });
      const newId = res?.project?.id || res?.id;
      if (newId) setProjectId(newId);
      alert('Project saved!');
    } catch {
      alert('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [projectId, selectedTemplate]);

  // ── Submit work order ─────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      let previewUrl;
      if (isFloodFillMode.current) {
        const cvs = canvasRef.current;
        previewUrl = cvs ? cvs.toDataURL('image/png') : '';
      } else {
        const canvas = fabricRef.current;
        previewUrl = canvas ? canvas.toDataURL({ format: 'png', quality: 0.8 }) : '';
      }
      await submitWorkOrder({
        project_id: projectId || null,
        ...submitForm,
        preview_url: previewUrl,
      });
      setSubmitModal(false);
      alert('Work order submitted! We will contact you shortly.');
      window.location.hash = '#/my-work-orders';
    } catch {
      alert('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [projectId, submitForm]);

  // ── Filtered templates ────────────────────────────────────────
  const filtered = categoryFilter
    ? templates.filter(t => t.category === categoryFilter)
    : templates;

  // ═══════════════════════════════════════
  //  GALLERY VIEW
  // ═══════════════════════════════════════
  if (step === STEP.GALLERY) {
    return (
      <div className={styles.page}>
        <div className={styles.galleryHeader}>
          <h1>Stained Glass Designer</h1>
          <p>Choose a template to start designing or begin with a blank canvas.</p>
          {categories.length > 0 && (
            <div className={styles.filters}>
              <button
                className={`${styles.filterBtn} ${!categoryFilter ? styles.active : ''}`}
                onClick={() => setCategoryFilter('')}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`${styles.filterBtn} ${categoryFilter === cat ? styles.active : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {templatesLoading ? (
          <div className={styles.loading}>Loading templates…</div>
        ) : (
          <>
            {filtered.length === 0 && (
              <div className={styles.empty}>
                <p>No templates available yet.</p>
                <p>Contact us for a custom design quote.</p>
              </div>
            )}

            {filtered.length > 0 && (
              <div className={styles.grid}>
                {filtered.map(t => (
                  <div
                    key={t.id}
                    className={styles.templateCard}
                    onClick={async () => {
                      // Fetch full template (with svg_content / image_url) before entering designer
                      console.log('[DesignerPage] Template clicked:', t.id, t.name);
                      try {
                        const full = await api.get(`/templates/${t.id}`);
                        console.log('[DesignerPage] Full template fetched:', full);
                        // API response interceptor already extracts .data, so full IS the data
                        setSelectedTemplate(full);
                      } catch (err) {
                        console.error('[DesignerPage] Template fetch failed:', err);
                        console.log('[DesignerPage] Using gallery data as fallback');
                        setSelectedTemplate(t); // fallback to gallery data
                      }
                      setStep(STEP.DESIGN);
                    }}
                  >
                    {(t.thumbnail_url || t.image_url) ? (
                      <img 
                        src={
                          (t.thumbnail_url || t.image_url).startsWith('http')
                            ? (t.thumbnail_url || t.image_url)
                            : `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000'}${t.thumbnail_url || t.image_url}`
                        }
                        alt={t.name} 
                        className={styles.thumb}
                        onError={(e) => {
                          console.error('[DesignerPage] Failed to load thumbnail for', t.name, ':', t.thumbnail_url || t.image_url);
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = '<div class="' + styles.thumbPlaceholder + '"><span>✦</span></div>';
                        }}
                      />
                    ) : (
                      <div className={styles.thumbPlaceholder}><span>✦</span></div>
                    )}
                    <div className={styles.cardInfo}>
                      <h3>{t.name}</h3>
                      {t.category && <span className={styles.badge}>{t.category}</span>}
                      {t.difficulty && (
                        <span className={`${styles.badge} ${styles[t.difficulty?.toLowerCase()] || ''}`}>
                          {t.difficulty}
                        </span>
                      )}
                      {t.piece_count && <span className={styles.meta}>{t.piece_count} pieces</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Always show blank canvas option */}
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button
                className={styles.startBlank}
                onClick={() => {
                  setSelectedTemplate({ id: null, name: 'Custom Design', svg_content: null });
                  setStep(STEP.DESIGN);
                }}
              >
                Start with Blank Canvas
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════
  //  DESIGNER VIEW
  // ═══════════════════════════════════════
  return (
    <div className={styles.designerLayout}>

      {/* ── Toolbar ─────────────────────────────────── */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={() => setStep(STEP.GALLERY)}>
          ← Gallery
        </button>
        <span className={styles.templateName}>{selectedTemplate?.name}</span>
        <button className={styles.toolBtn} onClick={undo}>↩ Undo</button>
        <button className={styles.toolBtn} onClick={redo}>↪ Redo</button>
        <button className={styles.toolBtn} onClick={fillAll} title="Fill all pieces with current color">
          Fill All
        </button>
        <button className={styles.toolBtn} onClick={resetCanvas} title="Remove all colour and texture">
          ↺ Reset
        </button>
        <div className={styles.spacer} />
        {customerToken ? (
          <>
            <button
              className={`${styles.toolBtn} ${styles.save}`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : '💾 Save'}
            </button>
            <button
              className={`${styles.toolBtn} ${styles.submit}`}
              onClick={() => setSubmitModal(true)}
            >
              📋 Submit Work Order
            </button>
          </>
        ) : (
          <button
            className={`${styles.toolBtn} ${styles.loginPrompt}`}
            onClick={() => window.location.hash = '#/account/login'}
          >
            🔒 Login to Save
          </button>
        )}
      </div>

      {/* ── Work Area ────────────────────────────────── */}
      <div className={styles.workArea}>

        {/* Canvas */}
        <div className={styles.canvasWrapper}>
          <canvas ref={canvasRef} />
          {selectedTemplate?.template_type === 'image' ? (
            <div className={styles.hint}>Pick a color, then click any white section to fill it in</div>
          ) : (
            <div className={styles.hint}>Pick a color from the palette, then click any section to fill it</div>
          )}
        </div>

        {/* Side Panel */}
        <div className={styles.sidePanel}>

          <div className={styles.toolsRow}>
            {/* ── Color Palette (primary tool) ─────────────────── */}
            <div ref={colorToolBoxRef} className={`${styles.panelSection} ${styles.toolBox} ${styles.colorToolBox}`}>
              <h3 className={styles.paletteHeading}>🎨 Pick a Color</h3>

              {/* Active color indicator */}
              <div className={styles.activeColorRow}>
                <div
                  className={styles.activeColorSwatch}
                  style={{ background: selectedColor }}
                  title="Current active color"
                />
                <span className={styles.activeColorLabel}>Active color — click any section to fill</span>
              </div>

              {/* Quick palette grid */}
              <div className={styles.paletteGrid}>
                {QUICK_COLORS.map(c => (
                  <div
                    key={c}
                    className={`${styles.paletteCell} ${selectedColor === c ? styles.paletteCellActive : ''}`}
                    style={{ background: c }}
                    onClick={() => {
                      selectedColorRef.current = c;
                      setSelectedColor(c);
                    }}
                    title={c}
                  />
                ))}
              </div>

              {/* Custom color picker — native input, no library warnings */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={e => {
                    selectedColorRef.current = e.target.value;
                    setSelectedColor(e.target.value);
                  }}
                  style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                  title="Custom color"
                />
                <span style={{ fontSize: '0.78rem', color: '#5d3a1a' }}>Custom color</span>
              </div>

              <p className={styles.designerDisclaimer}>
                Please note: Glass textures and colors may vary. Some colors are not available in certain textures. If there is any issue with your selected color or texture, we will contact you to confirm alternatives.
              </p>
            </div>

            {/* Glass Types Picker */}
            {glassTypes.length > 0 && (
              <div
                className={`${styles.panelSection} ${styles.toolBox} ${styles.glassToolBox}`}
                style={syncedToolBoxHeight ? { height: `${syncedToolBoxHeight}px` } : undefined}
              >
                <h3 className={styles.paletteHeading}>🪟 Glass Type</h3>

                {/* Active glass type indicator */}
                {activeGlassType && (
                  <div className={styles.activeGlassRow}>
                    {activeGlassType.texture_url ? (
                      <img
                        src={
                          activeGlassType.texture_url.startsWith('http')
                            ? activeGlassType.texture_url
                            : `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000'}${activeGlassType.texture_url}`
                        }
                        alt={activeGlassType.name}
                        className={styles.activeGlassThumb}
                      />
                    ) : (
                      <div className={styles.activeGlassThumb} style={{ background: '#ddd' }} />
                    )}
                    <div className={styles.activeGlassInfo}>
                      <strong>{activeGlassType.name}</strong>
                      <span className={styles.meta}>{activeGlassType.description?.slice(0, 60)}…</span>
                    </div>
                    <button
                      className={styles.clearGlassBtn}
                      onClick={() => setActiveGlassType(null)}
                      title="Clear glass type selection"
                    >✕</button>
                  </div>
                )}

                {/* Scrollable glass type grid */}
                <div className={styles.glassScrollArea}>
                  <div className={styles.glassGrid}>
                    {glassTypes.map(g => (
                      <div
                        key={g.id}
                        className={`${styles.glassChip} ${activeGlassType?.id === g.id ? styles.selectedChip : ''}`}
                        onClick={() => applyGlassType(g)}
                        title={g.description || g.name}
                      >
                        {g.texture_url ? (
                          <img
                            src={
                              g.texture_url.startsWith('http')
                                ? g.texture_url
                                : `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000'}${g.texture_url}`
                            }
                            alt={g.name}
                            onError={(e) => {
                              const attemptedUrl = g.texture_url.startsWith('http')
                                ? g.texture_url
                                : `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000'}${g.texture_url}`;
                              console.error('[DesignerPage] Failed to load glass texture thumbnail:', g.name, 'Original URL:', g.texture_url, 'Attempted URL:', attemptedUrl);
                              e.target.parentElement.innerHTML = '<div class="' + styles.glassColorBlock + '" style="background: #ddd"></div><span>' + g.name + '</span>';
                            }}
                          />
                        ) : (
                          <div className={styles.glassColorBlock} style={{ background: g.color || '#ccc' }} />
                        )}
                        <span>{g.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Last colored piece indicator */}
          {selectedObj && (
            <div className={styles.panelSection}>
              <h3>Last Colored</h3>
              <div className={styles.lastColoredRow}>
                <div className={styles.colorPreview} style={{ background: selectedObj.fill }} />
                <div>
                  <span className={styles.meta}>{selectedObj.fill}</span>
                  {selectedObj.glassType && (
                    <span className={styles.lastGlassLabel}>Glass: {selectedObj.glassType}</span>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>{/* /sidePanel */}
      </div>{/* /workArea */}

      {/* ── Submit Work Order Modal ─────────────────── */}
      {submitModal && (
        <div className={styles.modalOverlay} onClick={() => setSubmitModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <button className={styles.closeModal} onClick={() => setSubmitModal(false)}>×</button>
            <h2>Submit Work Order</h2>
            <p>Provide details for your custom stained glass piece and we will reach out with a quote.</p>

            <label>
              Notes / Special Requests
              <textarea
                value={submitForm.notes}
                onChange={e => setSubmitForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Describe any requirements, colors, dimensions…"
                rows={3}
              />
            </label>
            <label>
              Desired Timeline
              <input
                type="text"
                value={submitForm.timeline}
                onChange={e => setSubmitForm(f => ({ ...f, timeline: e.target.value }))}
                placeholder="e.g. Within 3 months"
              />
            </label>
            <label>
              Budget Range
              <input
                type="text"
                value={submitForm.budget}
                onChange={e => setSubmitForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="e.g. $200–$500"
              />
            </label>
            <label>
              Contact Info (phone or email)
              <input
                type="text"
                value={submitForm.contact}
                onChange={e => setSubmitForm(f => ({ ...f, contact: e.target.value }))}
                placeholder="Best way to reach you"
              />
            </label>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setSubmitModal(false)}>Cancel</button>
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit Order'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

