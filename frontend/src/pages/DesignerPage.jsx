import React, { useState, useEffect, useRef, useCallback } from 'react';
import api, { getTemplates, saveProject, submitWorkOrder, getProject, getTemplate,
  getWorkOrder, getAdminWorkOrder, createCustomerRevision, createAdminRevision,
  approveWorkOrder as apiApproveWorkOrder, getWorkOrderRevisions, getAdminWorkOrderRevisions
} from '../services/api';
import useCustomerAuth from '../hooks/useCustomerAuth';
import useAuth from '../hooks/useAuth';
import styles from './DesignerPage.module.css';

const STEP = { GALLERY: 'gallery', DESIGN: 'design' };

// Parse URL query params from hash router (?project=123&submit=true)
const getQueryParams = () => {
  const hash = window.location.hash || '';
  const queryIdx = hash.indexOf('?');
  if (queryIdx === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(queryIdx + 1)));
};

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

const getApiOrigin = () => {
  const configuredBase = import.meta.env.VITE_API_BASE_URL || '/api';
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '');
  }
  return window.location.hostname === 'localhost'
    ? `${window.location.protocol}//localhost:5000`
    : window.location.origin;
};

const resolveBackendAssetUrl = (value, fallbackFolder = '') => {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${getApiOrigin()}${value}`;
  if (fallbackFolder) return `${getApiOrigin()}${fallbackFolder}/${value}`;
  return `${getApiOrigin()}/${value}`;
};

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

  // Track per-section fills: { [regionId]: { color, glassType, glassTypeId } }
  const sectionFillsRef = useRef({});
  // Counter to force re-render when sections are filled (hides labels)
  const [fillVersion, setFillVersion] = useState(0);

  // Section label positions for numbered overlays: [{ id, num, cx, cy }]
  const [sectionLabels, setSectionLabels] = useState([]);

  // Border/frame region IDs (flood-fill mode) — not colorable
  const borderRegionsRef = useRef(new Set());

  // Saved design data from work order (used as fallback when template image is missing)
  const woDesignDataRef = useRef(null);

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
  const { authToken } = useAuth();

  // ── Work Order revision mode ─────────────────────────────────
  const [workOrderMode, setWorkOrderMode] = useState(false);
  const [workOrderId, setWorkOrderId] = useState(null);
  const [workOrderData, setWorkOrderData] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [savingRevision, setSavingRevision] = useState(false);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const isAdmin = !!authToken && !customerToken; // admin token but no customer token

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

  // ── Load existing project from URL params ───────────────────
  const [loadingProject, setLoadingProject] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  
  useEffect(() => {
    const params = getQueryParams();
    const projectIdParam = params.project;
    const submitFlag = params.submit === 'true';
    
    if (!projectIdParam) return;
    
    setLoadingProject(true);
    getProject(projectIdParam)
      .then(async (res) => {
        const project = res?.project || res;
        if (!project) return;
        
        // Set project ID
        setProjectId(project.id);
        
        // Auto-detect existing work order → switch to revision mode
        if (project.work_order_id) {
          setWorkOrderMode(true);
          setWorkOrderId(project.work_order_id);
          // Load full work order data to populate WO mode
          const fetchWO = isAdmin ? getAdminWorkOrder : getWorkOrder;
          const fetchRevisions = isAdmin ? getAdminWorkOrderRevisions : getWorkOrderRevisions;
          try {
            const woRes = await fetchWO(project.work_order_id);
            const wo = woRes?.work_order || woRes;
            if (wo) setWorkOrderData(wo);
          } catch (err) {
            console.error('[DesignerPage] Failed to load associated work order:', err);
          }
          try {
            const revRes = await fetchRevisions(project.work_order_id);
            setRevisions(revRes?.revisions || []);
          } catch {}
        }

        // Load the template if available
        if (project.template_id) {
          try {
            const templateRes = await getTemplate(project.template_id);
            const template = templateRes?.template || templateRes;
            if (template) {
              setSelectedTemplate(template);
              setStep(STEP.DESIGN);
            }
          } catch (err) {
            console.error('[DesignerPage] Failed to load project template:', err);
          }
        }
        
        // Store design data for canvas init to apply
        if (project.design_data && Object.keys(project.design_data).length > 0) {
          woDesignDataRef.current = project.design_data;
        }
        
        // Auto-open submit modal if requested
        if (submitFlag) {
          setAutoSubmit(true);
        }
      })
      .catch(err => {
        console.error('[DesignerPage] Failed to load project:', err);
      })
      .finally(() => setLoadingProject(false));
  }, []); // Only run once on mount

  // ── Load work order from URL params (revision mode) ──────────
  useEffect(() => {
    const params = getQueryParams();
    const woId = params.workorder;
    if (!woId) return;

    setWorkOrderMode(true);
    setWorkOrderId(Number(woId));
    setLoadingProject(true);

    const fetchWO = isAdmin ? getAdminWorkOrder : getWorkOrder;
    const fetchRevisions = isAdmin ? getAdminWorkOrderRevisions : getWorkOrderRevisions;

    fetchWO(woId)
      .then(async (res) => {
        const wo = res?.work_order || res;
        if (!wo) return;
        setWorkOrderData(wo);

        // Load template  
        const templateData = wo.template;
        const templateId = templateData?.id || wo.project?.template_id;
        let template = templateData;

        if (templateId && !template?.svg_content && !template?.image_url) {
          try {
            const tplRes = await getTemplate(templateId);
            template = tplRes?.template || tplRes;
          } catch (err) {
            console.error('[DesignerPage] Failed to load WO template:', err);
          }
        }

        if (template) {
          setSelectedTemplate(template);
          setStep(STEP.DESIGN);
        }

        // Set project ID for continuity
        if (wo.project?.id) setProjectId(wo.project.id);

        // Store design data so canvas init can apply it after initialisation
        const designData = wo.latest_revision?.design_data || wo.project?.design_data;
        if (designData && Object.keys(designData).length > 0) {
          // Store in ref — canvas init will apply after canvas is ready
          woDesignDataRef.current = designData;
        }
      })
      .catch(err => console.error('[DesignerPage] Failed to load work order:', err))
      .finally(() => setLoadingProject(false));

    // Also load revision history
    fetchRevisions(woId)
      .then(res => {
        const revs = res?.revisions || [];
        setRevisions(revs);
      })
      .catch(() => {});
  }, []); // Only run once on mount
  
  // Apply design data to canvas
  const applyDesignData = (designData) => {
    if (!designData || typeof designData !== 'object') return;
    
    // Restore section fills from saved data
    if (designData.sections && typeof designData.sections === 'object') {
      sectionFillsRef.current = { ...designData.sections };
    }
    
    // For SVG templates with Fabric.js
    if (fabricRef.current) {
      fabricRef.current.getObjects().forEach(obj => {
        const regionId = obj.id || obj.regionId;
        if (regionId && designData[regionId]) {
          const regionData = designData[regionId];
          if (regionData.color) {
            obj.set('fill', regionData.color);
          }
        }
      });
      fabricRef.current.renderAll();
    }
    
    // For image-based templates with saved dataUrl, redraw the canvas from the snapshot
    if (isFloodFillMode.current && designData.dataUrl && canvasRef.current) {
      const cvs = canvasRef.current;
      const CANVAS_W = 700;
      const CANVAS_H = 500;
      // Ensure canvas has correct dimensions (guard against default 300x150)
      if (cvs.width !== CANVAS_W) cvs.width = CANVAS_W;
      if (cvs.height !== CANVAS_H) cvs.height = CANVAS_H;
      const ctx = cvs.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        // Update history with restored state
        const snap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
        historyRef.current = [snap];
        historyIdxRef.current = 0;
        console.log('[DesignerPage] Restored flood-fill canvas from saved dataUrl at', CANVAS_W, 'x', CANVAS_H);
      };
      img.src = designData.dataUrl;
    }
    
    console.log('[DesignerPage] Applied design data:', Object.keys(designData).length, 'keys');
  };
  
  // Auto-submit when project is loaded with submit flag
  useEffect(() => {
    if (autoSubmit && step === STEP.DESIGN && !loadingProject) {
      // If already in work order mode, don't open the WO form — just show revision history
      if (workOrderMode) {
        setShowRevisionHistory(true);
      } else {
        setSubmitModal(true);
      }
      setAutoSubmit(false);
    }
  }, [autoSubmit, step, loadingProject, workOrderMode]);

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
            const textureUrl = resolveBackendAssetUrl(gt.texture_url, '/uploads/textures');
            
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

          const src = resolveBackendAssetUrl(selectedTemplate.image_url, '/uploads/templates');

          // Load the image (try template URL first, then fall back to saved dataUrl)
          let imgEl = await new Promise((resolve, reject) => {
            const el = document.createElement('img');
            el.crossOrigin = 'anonymous';
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = src;
          }).catch(() => null);

          // Fallback: if template image failed, try to restore from saved dataUrl
          if (!imgEl && woDesignDataRef.current?.dataUrl) {
            console.log('[DesignerPage] Template image failed to load, using saved dataUrl fallback');
            imgEl = await new Promise((resolve, reject) => {
              const el = document.createElement('img');
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = woDesignDataRef.current.dataUrl;
            }).catch(() => null);
          }
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

          // ── Detect border/background regions that touch the canvas edges ──
          // Any region whose bbox touches 2+ canvas edges is a frame,
          // corner, or background piece and should not be colorable.
          const borderRegions = new Set();
          for (const [regionId, pixels] of regionPixels) {
            let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
            for (const pi of pixels) {
              const px = pi % CANVAS_W;
              const py = Math.floor(pi / CANVAS_W);
              if (px < minX) minX = px;
              if (py < minY) minY = py;
              if (px > maxX) maxX = px;
              if (py > maxY) maxY = py;
            }
            const touchesLeft   = minX <= 2;
            const touchesTop    = minY <= 2;
            const touchesRight  = maxX >= CANVAS_W - 3;
            const touchesBottom = maxY >= CANVAS_H - 3;
            const edgesTouched = [touchesLeft, touchesTop, touchesRight, touchesBottom].filter(Boolean).length;
            if (edgesTouched >= 2) {
              borderRegions.add(regionId);
            }
          }
          borderRegionsRef.current = borderRegions;

          // Save initial state for undo
          historyRef.current = [ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)];
          historyIdxRef.current = 0;

          // ── Draw numbered labels on each region ──
          {
            // --- Pass 1: collect all region info ---
            const raw = [];
            let num = 0;
            for (const [regionId, pixels] of regionPixels) {
              if (pixels.length < 20) continue;
              // Skip border/frame regions
              if (borderRegions.has(regionId)) continue;
              num++;
              let sumX = 0, sumY = 0;
              let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
              for (const pi of pixels) {
                const px = pi % CANVAS_W;
                const py = Math.floor(pi / CANVAS_W);
                sumX += px; sumY += py;
                if (px < minX) minX = px;
                if (py < minY) minY = py;
                if (px > maxX) maxX = px;
                if (py > maxY) maxY = py;
              }
              const cxPx = sumX / pixels.length;
              const cyPx = sumY / pixels.length;
              raw.push({
                id: regionId, num, cx: cxPx, cy: cyPx,
                left: minX, top: minY, right: maxX, bottom: maxY,
                area: pixels.length,
                w: maxX - minX, h: maxY - minY,
                canvasW: CANVAS_W, canvasH: CANVAS_H,
              });
            }

            // --- Pass 2: remove full-canvas background fills ---
            const canvasArea = CANVAS_W * CANVAS_H;
            const filtered = raw.filter((s) => {
              if (s.area < canvasArea * 0.6) return true;
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

            // --- Pass 3: deduplicate & build final labels ---
            const labels = [];
            for (const s of filtered) {
              const tooClose = labels.some(l => {
                const lx = l.anchorX ?? l.cx;
                const ly = l.anchorY ?? l.cy;
                return Math.abs(lx - s.cx) < 15 && Math.abs(ly - s.cy) < 15;
              });
              if (tooClose) continue;

              const isSmall = s.area < 400;
              if (isSmall) {
                const dx = s.cx - CANVAS_W / 2;
                const dy = s.cy - CANVAS_H / 2;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const offsetDist = 35;
                let labelX = s.cx + (dx / dist) * offsetDist;
                let labelY = s.cy + (dy / dist) * offsetDist;
                labelX = Math.max(15, Math.min(CANVAS_W - 15, labelX));
                labelY = Math.max(15, Math.min(CANVAS_H - 15, labelY));
                labels.push({
                  id: s.id, num: s.num, cx: labelX, cy: labelY,
                  anchorX: s.cx, anchorY: s.cy, small: true,
                  canvasW: CANVAS_W, canvasH: CANVAS_H,
                });
              } else {
                labels.push({ id: s.id, num: s.num, cx: s.cx, cy: s.cy, canvasW: CANVAS_W, canvasH: CANVAS_H });
              }
            }
            setSectionLabels(labels);
          }

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
            // Block coloring of border/frame regions
            if (borderRegionsRef.current && borderRegionsRef.current.has(regionId)) return;
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
            // Track section fill for work order data
            // Find section number from labels
            const lbl = sectionLabels.find(l => l.id === regionId);
            sectionFillsRef.current[regionId] = {
              color,
              glassType: gt?.name || null,
              glassTypeId: gt?.id || null,
              sectionNum: lbl?.num || null,
            };
            setFillVersion(v => v + 1);
          };
          cvs.addEventListener('click', handleClick);

          // Store cleanup ref
          fabricRef.current = { _floodCleanup: () => cvs.removeEventListener('click', handleClick) };

          // Apply saved WO design data now that canvas is fully initialised at 700x500
          if (woDesignDataRef.current && !destroyed) {
            applyDesignData(woDesignDataRef.current);
          }

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
            const scaleF = Math.min(CANVAS_W / gW, CANVAS_H / gH) * 0.995;

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

        // ── Detect border/frame/background sections and lock them ──
        // Any section whose bbox touches 2+ canvas edges is a frame, corner,
        // or background piece and should not be colorable.
        const EDGE_MARGIN = 8;
        const isTracedSvgTemplate = !!selectedTemplate?.image_url;
        const canvasArea = CANVAS_W * CANVAS_H;
        const MIN_SEGMENT_AREA = isTracedSvgTemplate ? Math.max(220, canvasArea * 0.0022) : 0;
        const MIN_SEGMENT_SIDE = isTracedSvgTemplate ? 12 : 3;
        const MAX_SEGMENT_ASPECT = isTracedSvgTemplate ? 10 : 40;
        canvas.getObjects().forEach((obj) => {
          if (!obj.selectable) return;
          const b = obj.getBoundingRect();
          const area = b.width * b.height;
          const aspect = Math.max(b.width, b.height) / Math.max(1, Math.min(b.width, b.height));
          const tooSmall = b.width < MIN_SEGMENT_SIDE || b.height < MIN_SEGMENT_SIDE || area < MIN_SEGMENT_AREA;
          const tooThin = aspect > MAX_SEGMENT_ASPECT;
          if (tooSmall || tooThin) {
            obj.set({
              selectable: false,
              evented: false,
              hoverCursor: 'default',
            });
            obj._isNoise = true;
            return;
          }
          const touchesLeft   = b.left < EDGE_MARGIN;
          const touchesTop    = b.top < EDGE_MARGIN;
          const touchesRight  = b.left + b.width > CANVAS_W - EDGE_MARGIN;
          const touchesBottom = b.top + b.height > CANVAS_H - EDGE_MARGIN;
          const edgesTouched  = [touchesLeft, touchesTop, touchesRight, touchesBottom].filter(Boolean).length;
          if (edgesTouched >= 2) {
            obj.set({
              selectable: false,
              evented: false,
              hoverCursor: 'default',
              fill: 'white',
            });
            obj._isBorder = true;
          }
        });
        canvas.renderAll();

        pushHistory(canvas);

        // ── Compute numbered section labels for SVG paths ──
        {
          // --- Pass 1: collect all section info ---
          const raw = [];
          let num = 0;
          canvas.getObjects().forEach((obj) => {
            if (!obj.selectable || obj._isNoise || obj._isBorder) return;
            const bounds = obj.getBoundingRect();
            if (bounds.width < MIN_SEGMENT_SIDE || bounds.height < MIN_SEGMENT_SIDE) return;
            num++;
            obj._sectionNumber = num;
            obj._sectionId = `sec-${num}`;
            const cx = bounds.left + bounds.width / 2;
            const cy = bounds.top + bounds.height / 2;
            raw.push({
              id: obj._sectionId,
              num, cx, cy,
              left: bounds.left, top: bounds.top,
              right: bounds.left + bounds.width,
              bottom: bounds.top + bounds.height,
              area: bounds.width * bounds.height,
              w: bounds.width, h: bounds.height,
              canvasW: CANVAS_W, canvasH: CANVAS_H,
            });
          });

          // --- Pass 2: remove full-canvas background fills ---
          // Only remove sections covering >60% of the canvas that contain other sections.
          // This preserves real template sections (cat body, etc.) while removing
          // true all-encompassing backgrounds.
          const canvasArea = CANVAS_W * CANVAS_H;
          const filtered = raw.filter((s) => {
            if (s.area < canvasArea * 0.6) return true; // keep if not huge
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

          // --- Pass 3: deduplicate close centroids & build final labels ---
          const labels = [];
          for (const s of filtered) {
            const tooClose = labels.some(l => {
              const lx = l.anchorX ?? l.cx;
              const ly = l.anchorY ?? l.cy;
              return Math.abs(lx - s.cx) < 15 && Math.abs(ly - s.cy) < 15;
            });
            if (tooClose) continue;

            const isSmall = Math.min(s.w, s.h) < 30;
            if (isSmall) {
              const dx = s.cx - CANVAS_W / 2;
              const dy = s.cy - CANVAS_H / 2;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const offsetDist = 35;
              let labelX = s.cx + (dx / dist) * offsetDist;
              let labelY = s.cy + (dy / dist) * offsetDist;
              labelX = Math.max(15, Math.min(CANVAS_W - 15, labelX));
              labelY = Math.max(15, Math.min(CANVAS_H - 15, labelY));
              labels.push({
                id: s.id, num: s.num, cx: labelX, cy: labelY,
                anchorX: s.cx, anchorY: s.cy, small: true,
                canvasW: CANVAS_W, canvasH: CANVAS_H,
              });
            } else {
              labels.push({
                id: s.id, num: s.num, cx: s.cx, cy: s.cy,
                canvasW: CANVAS_W, canvasH: CANVAS_H,
              });
            }
          }
          setSectionLabels(labels);
        }

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
          // Track section fill for work order data
          const sectionId = hit._sectionId || `sec-${hit._sectionNumber || canvas.getObjects().indexOf(hit) + 1}`;
          console.log('[DesignerPage] Section filled:', { sectionId, sectionNum: hit._sectionNumber, color });
          sectionFillsRef.current[sectionId] = {
            color,
            glassType: gt?.name || null,
            glassTypeId: gt?.id || null,
            sectionNum: hit._sectionNumber || null,
          };
          setFillVersion(v => v + 1);
          pushHistory(canvas);
        });
      } catch (err) {
        console.error('[DesignerPage] Canvas initialization error:', err);
        console.error('[DesignerPage] Error stack:', err.stack);
      }

      // Apply saved WO design data now that canvas is fully initialised
      if (woDesignDataRef.current && !destroyed) {
        applyDesignData(woDesignDataRef.current);
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
    sectionFillsRef.current = {};
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
      // Attach per-section color/glass assignments
      canvasData.sections = { ...(sectionFillsRef.current || {}) };
      canvasData.preview_url = previewUrl;
      const res = await saveProject({
        project_id: projectId || undefined,
        template_id: selectedTemplate?.id || null,
        design_data: canvasData,
        preview_url: previewUrl,
        project_name: selectedTemplate?.name || 'My Design',
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
      let canvasData;
      let previewUrl;
      if (isFloodFillMode.current) {
        const cvs = canvasRef.current;
        previewUrl = cvs ? cvs.toDataURL('image/png') : '';
        canvasData = { floodFill: true, dataUrl: previewUrl };
      } else {
        const canvas = fabricRef.current;
        canvasData = canvas ? canvas.toJSON() : {};
        previewUrl = canvas ? canvas.toDataURL({ format: 'png', quality: 0.8 }) : '';
      }
      // Attach per-section color/glass assignments
      canvasData.sections = { ...(sectionFillsRef.current || {}) };
      canvasData.preview_url = previewUrl;

      let ensuredProjectId = projectId || null;
      if (!ensuredProjectId) {
        const saveRes = await saveProject({
          template_id: selectedTemplate?.id || null,
          design_data: canvasData,
          preview_url: previewUrl,
          project_name: submitForm?.project_name || selectedTemplate?.name || 'My Design',
        });
        ensuredProjectId = saveRes?.project?.id || saveRes?.id || null;
        if (ensuredProjectId) setProjectId(ensuredProjectId);
      }

      await submitWorkOrder({
        project_id: ensuredProjectId,
        template_id: selectedTemplate?.id || null,
        canvas_data: canvasData,
        ...submitForm,
        preview_url: previewUrl,
      });
      setSubmitModal(false);
      alert('Work order submitted! We will contact you shortly.');
      window.location.hash = `#/my-work-orders?status=pending&refresh=${Date.now()}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch {
      alert('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [projectId, selectedTemplate, submitForm]);

  // ── Save revision (work order mode) ───────────────────────────
  const getCurrentDesignData = useCallback(() => {
    let canvasData, previewUrl;
    if (isFloodFillMode.current) {
      const cvs = canvasRef.current;
      previewUrl = cvs ? cvs.toDataURL('image/png') : '';
      canvasData = { floodFill: true, dataUrl: previewUrl };
    } else {
      const canvas = fabricRef.current;
      canvasData = canvas ? canvas.toJSON() : {};
      previewUrl = canvas ? canvas.toDataURL({ format: 'png', quality: 0.8 }) : '';
    }
    canvasData.sections = { ...(sectionFillsRef.current || {}) };
    canvasData.preview_url = previewUrl;
    return canvasData;
  }, []);

  const handleSaveRevision = useCallback(async (sendForReview = false) => {
    if (!workOrderId) return;
    setSavingRevision(true);
    try {
      const designData = getCurrentDesignData();
      let res;
      if (isAdmin) {
        res = await createAdminRevision(workOrderId, designData, revisionNotes, sendForReview);
      } else {
        res = await createCustomerRevision(workOrderId, designData, revisionNotes);
      }
      const newRev = res?.revision;
      if (newRev) setRevisions(prev => [...prev, newRev]);
      if (res?.work_order) setWorkOrderData(res.work_order);
      setRevisionNotes('');
      
      if (sendForReview) {
        alert(isAdmin ? 'Revision sent to customer for review!' : 'Revision submitted for admin review!');
        // Navigate back to the appropriate dashboard
        window.location.hash = isAdmin ? '#/admin' : `#/my-work-orders?refresh=${Date.now()}`;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else {
        alert('Revision saved!');
      }
    } catch (err) {
      console.error('[DesignerPage] Failed to save revision:', err);
      alert('Failed to save revision. Please try again.');
    } finally {
      setSavingRevision(false);
    }
  }, [workOrderId, isAdmin, revisionNotes, getCurrentDesignData]);

  const handleApproveDesign = useCallback(async () => {
    if (!workOrderId) return;
    if (!window.confirm('Approve this design? This will move the work order to production.')) return;
    try {
      await apiApproveWorkOrder(workOrderId);
      alert('Design approved! The work order will move to production.');
      window.location.hash = `#/my-work-orders?refresh=${Date.now()}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      console.error('[DesignerPage] Failed to approve:', err);
      alert('Failed to approve design. Please try again.');
    }
  }, [workOrderId]);

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
        {workOrderMode ? (
          <button className={styles.toolBtn} onClick={() => {
            window.location.hash = isAdmin ? '#/admin' : '#/my-work-orders';
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }}>
            ← Back
          </button>
        ) : (
          <button className={styles.toolBtn} onClick={() => setStep(STEP.GALLERY)}>
            ← Gallery
          </button>
        )}
        <span className={styles.templateName}>
          {workOrderMode
            ? `WO: ${workOrderData?.work_order_number || ''} — ${selectedTemplate?.name || 'Design'}`
            : selectedTemplate?.name}
        </span>
        <button className={styles.toolBtn} onClick={undo}>↩ Undo</button>
        <button className={styles.toolBtn} onClick={redo}>↪ Redo</button>
        <button className={styles.toolBtn} onClick={fillAll} title="Fill all pieces with current color">
          Fill All
        </button>
        <button className={styles.toolBtn} onClick={resetCanvas} title="Remove all colour and texture">
          ↺ Reset
        </button>
        <div className={styles.spacer} />

        {/* ── Work Order Mode buttons ── */}
        {workOrderMode ? (
          <>
            {revisions.length > 0 && (
              <button
                className={styles.toolBtn}
                onClick={() => setShowRevisionHistory(!showRevisionHistory)}
                title="View revision history"
              >
                📋 History ({revisions.length})
              </button>
            )}
            <button
              className={`${styles.toolBtn} ${styles.save}`}
              onClick={() => handleSaveRevision(false)}
              disabled={savingRevision}
            >
              {savingRevision ? 'Saving…' : '💾 Save Revision'}
            </button>
            <button
              className={`${styles.toolBtn} ${styles.submit}`}
              onClick={() => handleSaveRevision(true)}
              disabled={savingRevision}
            >
              {isAdmin ? '📤 Send for Review' : '📤 Submit Changes'}
            </button>
            {!isAdmin && (
              <button
                className={`${styles.toolBtn} ${styles.approveBtn}`}
                onClick={handleApproveDesign}
                title="Approve the current design"
              >
                ✅ Approve
              </button>
            )}
          </>
        ) : customerToken ? (
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

      {/* ── Revision History Sidebar ─────────────────── */}
      {workOrderMode && showRevisionHistory && (
        <div className={styles.revisionSidebar}>
          <div className={styles.revisionSidebarHeader}>
            <h3>Revision History</h3>
            <button onClick={() => setShowRevisionHistory(false)}>×</button>
          </div>
          <div className={styles.revisionNoteInput}>
            <textarea
              value={revisionNotes}
              onChange={e => setRevisionNotes(e.target.value)}
              placeholder="Add notes about this revision..."
              rows={2}
            />
          </div>
          <div className={styles.revisionList}>
            {revisions.length === 0 ? (
              <p className={styles.noRevisions}>No revisions yet. Original submission.</p>
            ) : (
              revisions.map(rev => (
                <div
                  key={rev.id}
                  className={styles.revisionItem}
                  onClick={() => {
                    // Load this revision's design data
                    if (rev.design_data) {
                      applyDesignData(rev.design_data);
                    }
                  }}
                  title="Click to load this revision"
                >
                  <div className={styles.revisionHeader}>
                    <span className={styles.revisionNumber}>Rev #{rev.revision_number}</span>
                    <span className={`${styles.revisionAuthor} ${rev.author_type === 'admin' ? styles.adminBadge : styles.customerBadge}`}>
                      {rev.author_type === 'admin' ? '👤 Admin' : '🎨 Customer'}
                    </span>
                  </div>
                  <div className={styles.revisionDate}>
                    {rev.created_at ? new Date(rev.created_at).toLocaleString() : ''}
                  </div>
                  {rev.notes && <div className={styles.revisionNotes}>{rev.notes}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Work Area ────────────────────────────────── */}
      <div className={styles.workArea}>

        {/* Canvas */}
        <div className={styles.canvasWrapper}>
          <canvas ref={canvasRef} />
          {/* ── Numbered section labels overlay ── */}
          {sectionLabels.length > 0 && (
            <div className={styles.sectionLabelsOverlay}>
              {/* Leader lines for small sections */}
              <svg
                className={styles.leaderLineSvg}
                viewBox={`0 0 ${sectionLabels[0]?.canvasW || 700} ${sectionLabels[0]?.canvasH || 500}`}
              >
                {sectionLabels
                  .filter((lbl) => lbl.small && !sectionFillsRef.current[lbl.id])
                  .map((lbl) => (
                    <line
                      key={`line-${lbl.id}`}
                      x1={lbl.anchorX}
                      y1={lbl.anchorY}
                      x2={lbl.cx}
                      y2={lbl.cy}
                      stroke="#444"
                      strokeWidth="1"
                    />
                  ))}
              </svg>
              {sectionLabels
                .filter((lbl) => !sectionFillsRef.current[lbl.id])
                .map((lbl) => {
                const leftPct = (lbl.cx / lbl.canvasW) * 100;
                const topPct = (lbl.cy / lbl.canvasH) * 100;
                return (
                  <div
                    key={lbl.id}
                    className={styles.sectionBadge}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    title={`Section ${lbl.num}`}
                  >
                    {lbl.num}
                  </div>
                );
              })}
            </div>
          )}
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
                          resolveBackendAssetUrl(activeGlassType.texture_url, '/uploads/textures')
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
                              resolveBackendAssetUrl(g.texture_url, '/uploads/textures')
                            }
                            alt={g.name}
                            onError={(e) => {
                              const attemptedUrl = g.texture_url.startsWith('http')
                                ? g.texture_url
                                : resolveBackendAssetUrl(g.texture_url, '/uploads/textures');
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

