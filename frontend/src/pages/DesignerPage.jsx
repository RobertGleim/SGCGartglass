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
  const [selectedObj, setSelectedObj] = useState(null);
  const [selectedColor, setSelectedColor] = useState('#c8a96e');
  // Ref so canvas event handlers (stale closures) always read the current color
  const selectedColorRef = useRef('#c8a96e');
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);

  // Glass types
  const [glassTypes, setGlassTypes] = useState([]);
  const [activeGlassType, setActiveGlassType] = useState(null);

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
        const items = res.data?.items || res.data || [];
        setTemplates(items);
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
      .then(res => setGlassTypes(res.data?.items || res.data || []))
      .catch(() => setGlassTypes([]));
  }, [step]);

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

    let destroyed = false;
    isFloodFillMode.current = false;

    // ── Flood-fill helpers (for image / PDF templates) ────────────
    // Classic queue-based "bucket fill" that stops at dark outlines.
    function floodFill(ctx, startX, startY, fillR, fillG, fillB) {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      const sx = Math.round(startX);
      const sy = Math.round(startY);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

      const idx = (sy * w + sx) * 4;
      const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];

      // Don't fill if clicking the same color
      if (tR === fillR && tG === fillG && tB === fillB) return;

      // Don't fill dark outlines (luminance < 60)
      const tLum = 0.299 * tR + 0.587 * tG + 0.114 * tB;
      if (tLum < 60 && tA > 200) return;

      const tolerance = 50; // how different a colour must be to stop the fill

      function matches(i) {
        return (
          Math.abs(data[i] - tR) <= tolerance &&
          Math.abs(data[i + 1] - tG) <= tolerance &&
          Math.abs(data[i + 2] - tB) <= tolerance &&
          Math.abs(data[i + 3] - tA) <= tolerance
        );
      }

      const stack = [[sx, sy]];
      const visited = new Uint8Array(w * h);

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        const pi = cy * w + cx;
        if (visited[pi]) continue;
        const ci = pi * 4;
        if (!matches(ci)) continue;
        visited[pi] = 1;
        data[ci] = fillR;
        data[ci + 1] = fillG;
        data[ci + 2] = fillB;
        data[ci + 3] = 255;
        if (cx > 0)     stack.push([cx - 1, cy]);
        if (cx < w - 1) stack.push([cx + 1, cy]);
        if (cy > 0)     stack.push([cx, cy - 1]);
        if (cy < h - 1) stack.push([cx, cy + 1]);
      }
      ctx.putImageData(imageData, 0, 0);
    }

    function hexToRgb(hex) {
      const n = parseInt(hex.replace('#', ''), 16);
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }
    // ── End flood-fill helpers ────────────────────────────────────

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

          // Save initial state for undo
          historyRef.current = [ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)];
          historyIdxRef.current = 0;

          // Click handler for flood fill
          const handleClick = (e) => {
            const rect = cvs.getBoundingClientRect();
            const scaleX = cvs.width / rect.width;
            const scaleY = cvs.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            const [r, g, b] = hexToRgb(selectedColorRef.current);
            floodFill(ctx, x, y, r, g, b);
            // Push undo state
            const snap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
            const arr = historyRef.current.slice(0, historyIdxRef.current + 1);
            arr.push(snap);
            historyRef.current = arr;
            historyIdxRef.current = arr.length - 1;
            setSelectedObj({ fill: selectedColorRef.current }); // show "last colored"
          };
          cvs.addEventListener('click', handleClick);

          // Store cleanup ref
          fabricRef.current = { _floodCleanup: () => cvs.removeEventListener('click', handleClick) };
          return;
        }

        // ============================================================
        //  SVG TEMPLATE  →  Fabric.js with ungrouped paths
        // ============================================================
        const fabric = await import('fabric');
        const { Canvas, loadSVGFromString, util, Rect } = fabric;

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
          // Parse SVG string into Fabric objects
          let rawObjects = [];
          let svgOptions = {};
          try {
            const result = await loadSVGFromString(selectedTemplate.svg_content);
            rawObjects = (result.objects || []).filter(Boolean);
            svgOptions = result.options || {};
          } catch (e) {
            console.warn('SVG parse error:', e);
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

              child.set({
                left:   finalLeft,
                top:    finalTop,
                scaleX: finalScaleX,
                scaleY: finalScaleY,
                angle:  finalAngle,
                originX: 'center',
                originY: 'center',
                flipX: false, flipY: false,
                selectable: true,
                evented: true,
                hasControls: false,
                hasBorders: false,
                hoverCursor: 'pointer',
                perPixelTargetFind: true,
                objectCaching: false,
                fill:   (child.fill   && child.fill   !== 'none') ? child.fill   : '#d4c5a9',
                stroke: (child.stroke && child.stroke !== 'none') ? child.stroke : '#555',
                strokeWidth:   strokeW,
                strokeUniform: true,
              });
              child.setCoords();
              canvas.add(child);
            });
          }
        } else {
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
        }

        canvas.renderAll();
        pushHistory(canvas);

        // ── Coloring-book click-to-fill (SVG mode) ──────────────────
        canvas.on('mouse:down', (e) => {
          const hit = e.target;
          if (!hit || hit.selectable === false) return;
          const color = selectedColorRef.current;
          hit.set('fill', color);
          hit.dirty = true;
          canvas.requestRenderAll();
          setSelectedObj(hit);
          pushHistory(canvas);
        });
      } catch (err) {
        console.error('Fabric init error:', err);
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
      isFloodFillMode.current = false;
      setSelectedObj(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedTemplate]);

  // ── Apply glass type ──────────────────────────────────────────
  // Sets the active color from a glass type; next canvas click will fill with it
  const applyGlassType = useCallback((gt) => {
    setActiveGlassType(gt);
    const color = gt.color || gt.css_color || selectedColor;
    selectedColorRef.current = color;   // update ref immediately (no render delay)
    setSelectedColor(color);
  }, [selectedColor]);

  // ── Fill all pieces ───────────────────────────────────────────
  const fillAll = useCallback(() => {
    if (isFloodFillMode.current) {
      // In flood-fill mode: fill all non-outline (bright) pixels with current color
      const ctx = floodCtxRef.current;
      if (!ctx) return;
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const hex = selectedColor.replace('#', '');
      const fR = parseInt(hex.substring(0, 2), 16);
      const fG = parseInt(hex.substring(2, 4), 16);
      const fB = parseInt(hex.substring(4, 6), 16);
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        if (lum >= 60) { // not an outline
          data[i] = fR; data[i+1] = fG; data[i+2] = fB; data[i+3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      const snap = ctx.getImageData(0, 0, w, h);
      const arr = historyRef.current.slice(0, historyIdxRef.current + 1);
      arr.push(snap); historyRef.current = arr; historyIdxRef.current = arr.length - 1;
      return;
    }
    const canvas = fabricRef.current;
    if (!canvas) return;
    const applyFill = (obj) => {
      if (!obj) return;
      if (obj.type === 'group' || obj.type === 'Group') {
        obj.dirty = true;
        (obj._objects || []).forEach(applyFill);
      } else if (obj.selectable !== false) {
        obj.set('fill', selectedColor);
        obj.dirty = true;
      }
    };
    canvas.getObjects().forEach(applyFill);
    canvas.requestRenderAll();
    pushHistory(canvas);
  }, [selectedColor, pushHistory]);

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
      const newId = res.data?.project?.id || res.data?.id;
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
                      try {
                        const full = await api.get(`/templates/${t.id}`);
                        setSelectedTemplate(full.data);
                      } catch {
                        setSelectedTemplate(t); // fallback to gallery data
                      }
                      setStep(STEP.DESIGN);
                    }}
                  >
                    {(t.thumbnail_url || t.image_url)
                      ? <img src={t.thumbnail_url || t.image_url} alt={t.name} className={styles.thumb} />
                      : <div className={styles.thumbPlaceholder}><span>✦</span></div>
                    }
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

            {/* ── Color Palette (primary tool) ─────────────────── */}
          <div className={styles.panelSection}>
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
          </div>

          {/* Last colored piece indicator */}
          {selectedObj && (
            <div className={styles.panelSection}>
              <h3>Last Colored</h3>
              <div className={styles.lastColoredRow}>
                <div className={styles.colorPreview} style={{ background: selectedObj.fill }} />
                <span className={styles.meta}>{selectedObj.fill}</span>
              </div>
            </div>
          )}

          {/* Glass Types */}
          {glassTypes.length > 0 && (
            <div className={styles.panelSection}>
              <h3>Glass Types</h3>
              <div className={styles.glassGrid}>
                {glassTypes.map(g => (
                  <div
                    key={g.id}
                    className={`${styles.glassChip} ${activeGlassType?.id === g.id ? styles.selectedChip : ''}`}
                    onClick={() => applyGlassType(g)}
                    title={g.name}
                  >
                    {g.texture_url
                      ? <img src={g.texture_url} alt={g.name} />
                      : <div className={styles.glassColorBlock} style={{ background: g.color || '#ccc' }} />
                    }
                    <span>{g.name}</span>
                  </div>
                ))}
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

