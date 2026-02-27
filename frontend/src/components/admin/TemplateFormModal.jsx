import React, { useState, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import ImageTracer from 'imagetracerjs';
import api from '../../services/api';
import styles from './TemplateFormModal.module.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const getApiOrigin = () => {
  const configuredBase = import.meta.env.VITE_API_BASE_URL || '/api';
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '');
  }
  return window.location.hostname === 'localhost'
    ? `${window.location.protocol}//localhost:5000`
    : window.location.origin;
};

// Resolve relative URLs to full backend URL
const resolveImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return getApiOrigin() + url;
};

const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];
const ACCEPTED_TYPES = '.svg,.pdf,.jpg,.jpeg,.png';

function countSVGPaths(svgText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    return doc.querySelectorAll('path[id]').length;
  } catch {
    return 0;
  }
}

function ensureSvgPathIds(svgText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const paths = doc.querySelectorAll('path');
    let idx = 1;
    paths.forEach((p) => {
      if (!p.getAttribute('id')) {
        p.setAttribute('id', `trace_path_${idx}`);
      }
      idx += 1;
    });
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return svgText;
  }
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

async function preprocessRasterForTracing(blob) {
  const dataUrl = await blobToDataUrl(blob);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load raster for tracing'));
    img.src = dataUrl;
  });

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0);

  const pixels = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < sourceCanvas.height; y++) {
    for (let x = 0; x < sourceCanvas.width; x++) {
      const i = (y * sourceCanvas.width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      const isBackground = a < 20 || (r > 245 && g > 245 && b > 245);
      if (!isBackground) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const pad = 20;
  const cropX = found ? Math.max(0, minX - pad) : 0;
  const cropY = found ? Math.max(0, minY - pad) : 0;
  const cropW = found ? Math.min(sourceCanvas.width - cropX, (maxX - minX + 1) + pad * 2) : sourceCanvas.width;
  const cropH = found ? Math.min(sourceCanvas.height - cropY, (maxY - minY + 1) + pad * 2) : sourceCanvas.height;

  const targetMax = 2200;
  const scale = Math.min(1.8, targetMax / Math.max(cropW, cropH));
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outW, outH);
  outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  return outCanvas.toDataURL('image/png');
}

async function normalizeSvgViewport(svgText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return svgText;

    const tempWrap = document.createElement('div');
    tempWrap.style.position = 'fixed';
    tempWrap.style.left = '-10000px';
    tempWrap.style.top = '-10000px';
    tempWrap.style.width = '1px';
    tempWrap.style.height = '1px';
    tempWrap.style.overflow = 'hidden';

    const mountedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mountedSvg.innerHTML = svg.innerHTML;
    document.body.appendChild(tempWrap);
    tempWrap.appendChild(mountedSvg);

    const bbox = mountedSvg.getBBox();
    document.body.removeChild(tempWrap);

    if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) {
      return svgText;
    }

    const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    while (svg.firstChild) {
      wrapper.appendChild(svg.firstChild);
    }
    wrapper.setAttribute('transform', `translate(${-bbox.x}, ${-bbox.y})`);
    svg.appendChild(wrapper);

    const vw = Math.round(bbox.width);
    const vh = Math.round(bbox.height);
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', String(vw));
    svg.setAttribute('height', String(vh));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    return new XMLSerializer().serializeToString(svg);
  } catch {
    return svgText;
  }
}

async function rasterBlobToTracedSvg(blob) {
  const dataUrl = await preprocessRasterForTracing(blob);
  const rawSvg = await new Promise((resolve, reject) => {
    try {
      ImageTracer.imageToSVG(
        dataUrl,
        (svg) => {
          if (!svg || typeof svg !== 'string') {
            reject(new Error('Image tracing did not produce SVG output'));
            return;
          }
          resolve(svg);
        },
        {
          numberofcolors: 4,
          ltres: 0.6,
          qtres: 0.6,
          pathomit: 2,
          colorsampling: 0,
          blurradius: 0,
          blurdelta: 0,
          linefilter: false,
          rightangleenhance: true,
        },
      );
    } catch (err) {
      reject(err);
    }
  });
  const normalizedSvg = await normalizeSvgViewport(rawSvg);
  return ensureSvgPathIds(normalizedSvg);
}

/** Render first page of a PDF to a PNG Blob via canvas */
async function pdfToBlob(file) {
  const arrayBuffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
  } catch (error) {
    console.warn('[TemplateFormModal] PDF worker setup failed, retrying without worker...', error);
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
  }
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 4 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/** Upload image (Blob or File) to backend, returns image_url string */
async function uploadImageFile(fileOrBlob, fileName = 'upload.png') {
  const formData = new FormData();
  const uploadFile =
    fileOrBlob instanceof File
      ? fileOrBlob
      : new File([fileOrBlob], fileName, { type: 'image/png' });
  formData.append('file', uploadFile, fileName);
  const res = await api.post('/admin/templates/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.image_url;
}

export default function TemplateFormModal({ open, onClose, template, onSuccess, onDelete }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    category: template?.category || '',
    difficulty: template?.difficulty || DIFFICULTY_OPTIONS[0],
    dimensions: template?.dimensions || '',
    svg_content: template?.svg_content || '',
    image_url: template?.image_url || '',
    template_type: template?.template_type || 'svg',
    piece_count: template?.piece_count ?? 0,
  });
  const [fileType, setFileType] = useState(null); // 'svg' | 'image' | null (null = not yet chosen)
  const [previewUrl, setPreviewUrl] = useState(resolveImageUrl(template?.thumbnail_url || template?.image_url || ''));
  const [uploading, setUploading] = useState(false);
  const [convertingSvg, setConvertingSvg] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef();

  if (!open) return null;

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const processFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    const name = file.name.toLowerCase();
    const isSVG = name.endsWith('.svg') || file.type === 'image/svg+xml';
    const isPDF = name.endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = /\.(jpe?g|png|gif|webp)$/.test(name) || file.type.startsWith('image/');

    if (!isSVG && !isPDF && !isImage) {
      setError('Unsupported file type. Use SVG, PDF, JPEG, or PNG.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large (max 20 MB)');
      return;
    }

    if (isSVG) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgText = e.target.result;
        const pieceCount = countSVGPaths(svgText);
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        setPreviewUrl(URL.createObjectURL(blob));
        setFileType('svg');
        setForm(f => ({
          ...f,
          svg_content: svgText,
          piece_count: pieceCount,
          template_type: 'svg',
          image_url: '',
        }));
      };
      reader.onerror = () => setError('Failed to read SVG file');
      reader.readAsText(file);
      return;
    }

    // PDF or raster image — keep exact raster source and upload as image template
    setUploading(true);
    try {
      let uploadBlob = file;
      let uploadFileName = file.name;

      if (isPDF) {
        setUploadProgress('Rendering PDF — page 1…');
        const blob = await pdfToBlob(file);
        const pngName = file.name.replace(/\.pdf$/i, '.png');
        uploadBlob = blob;
        uploadFileName = pngName;
        setPreviewUrl(URL.createObjectURL(blob));
      } else {
        setPreviewUrl(URL.createObjectURL(file));
      }

      setUploadProgress('Uploading to server…');
      const imageUrl = await uploadImageFile(uploadBlob, uploadFileName);

      setPreviewUrl(`${getApiOrigin()}${imageUrl}`);
      setFileType('image');
      setForm(f => ({
        ...f,
        image_url: imageUrl,
        svg_content: '',
        piece_count: 0,
        template_type: 'image',
      }));
      setUploadProgress('');
    } catch (err) {
      console.error(err);
      setError(`Upload failed: ${err?.response?.data?.detail || err.message}`);
      setUploadProgress('');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileChange = (e) => processFile(e.target.files[0]);
  const handleDrop = (e) => { e.preventDefault(); processFile(e.dataTransfer.files[0]); };

  const convertExistingImageToSvg = async () => {
    if (!form.image_url) return;
    setError('');
    setConvertingSvg(true);
    try {
      const imgUrl = resolveImageUrl(form.image_url);
      const res = await fetch(imgUrl);
      if (!res.ok) throw new Error('Unable to read template image');
      const blob = await res.blob();
      const tracedSvg = await rasterBlobToTracedSvg(blob);
      const pieceCount = countSVGPaths(tracedSvg);
      setFileType('svg');
      setForm((f) => ({
        ...f,
        svg_content: tracedSvg,
        template_type: 'svg',
        piece_count: pieceCount,
      }));
    } catch (err) {
      setError(`SVG conversion failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setConvertingSvg(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.category.trim()) { setError('Category is required'); return; }
    if (!form.dimensions.trim()) { setError('Dimensions is required'); return; }

    const isNew = !template;
    const hasSVG = Boolean(form.svg_content?.trim());
    const hasImage = Boolean(form.image_url?.trim());

    if (isNew && !hasSVG && !hasImage) {
      setError('Please upload an SVG, PDF, JPEG, or PNG file');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        difficulty: form.difficulty,
        dimensions: form.dimensions.trim(),
        is_active: true,
        template_type: form.template_type,
      };
      if (hasSVG) payload.svg_content = form.svg_content;
      if (hasImage) {
        payload.image_url = form.image_url;
        payload.thumbnail_url = form.image_url;
      }

      if (template) {
        const res = await api.put(`/admin/templates/${template.id}`, payload);
        onSuccess && onSuccess(res || payload);
      } else {
        await api.post('/admin/templates', payload);
        onSuccess && onSuccess(null);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || 'Save failed';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const currentType = fileType || (template?.template_type ?? null);
  const hasContent = form.svg_content || form.image_url || template;
  const canSubmit = form.name && form.category && form.dimensions && hasContent && !uploading && !loading && !convertingSvg;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2>{template ? 'Edit Template' : 'Add New Template'}</h2>

        <form onSubmit={handleSubmit}>
          <label>Name *
            <input type="text" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
          </label>
          <label>Category *
            <input type="text" value={form.category} onChange={e => handleChange('category', e.target.value)} required />
          </label>
          <label>Difficulty *
            <select value={form.difficulty} onChange={e => handleChange('difficulty', e.target.value)}>
              {DIFFICULTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>Dimensions *
            <input
              type="text"
              placeholder="e.g. 12×16 inches"
              value={form.dimensions}
              onChange={e => handleChange('dimensions', e.target.value)}
              required
            />
          </label>

          {/* File upload zone */}
          <div className={styles.uploadSection}>
            <div className={styles.uploadLabel}>
              Template File {!template && '*'}
              <span className={styles.uploadHint}>SVG · PDF · JPEG · PNG</span>
            </div>

            <div
              className={`${styles.dropZone} ${uploading ? styles.dropZoneUploading : ''}`}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => !uploading && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && !uploading && fileInputRef.current?.click()}
              aria-label="Upload template file"
            >
              <input
                type="file"
                accept={ACCEPTED_TYPES}
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {uploading ? (
                <div className={styles.uploadProgress}>
                  <span className={styles.spinner} />
                  <span>{uploadProgress}</span>
                </div>
              ) : (
                <div className={styles.dropZoneContent}>
                  <span className={styles.uploadIcon}>📁</span>
                  <span>Drag & drop or <strong>click to browse</strong></span>
                  <span className={styles.uploadTypes}>SVG · PDF · JPEG · PNG (max 20 MB)</span>
                </div>
              )}
            </div>

            {/* Info badge about file type */}
            {currentType === 'svg' && (
              <div className={`${styles.fileTypeBadge} ${styles.badgeSvg}`}>
                ✓ SVG — exact section geometry is preserved for stained-glass production
                {form.piece_count > 0 && ` · ${form.piece_count} pieces detected`}
              </div>
            )}
            {currentType === 'image' && (
              <div className={`${styles.fileTypeBadge} ${styles.badgeImage}`}>
                ✓ Exact raster template — image fidelity is preserved from your upload
              </div>
            )}
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className={styles.previewWrap}>
              <img src={previewUrl} alt="Template preview" className={styles.thumb} />
            </div>
          )}

          {Boolean(form.image_url) && !Boolean(form.svg_content?.trim()) && (
            <button
              type="button"
              className={styles.svgConvertBtn}
              onClick={convertExistingImageToSvg}
              disabled={convertingSvg || uploading || loading}
            >
              {convertingSvg ? 'Converting to SVG…' : 'Generate SVG'}
            </button>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
            {loading ? 'Saving…' : uploading ? 'Uploading…' : (template ? 'Update Template' : 'Add Template')}
          </button>

          {/* Permanent delete — only shown when editing an existing template */}
          {template && onDelete && (
            <div className={styles.dangerZone}>
              <h4 className={styles.dangerTitle}>Danger Zone</h4>
              {!confirmDelete ? (
                <button
                  type="button"
                  className={styles.permanentDeleteBtn}
                  onClick={() => setConfirmDelete(true)}
                >
                  🗑 Permanently Delete Template
                </button>
              ) : (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmText}>Are you sure? This cannot be undone.</span>
                  <button
                    type="button"
                    className={styles.confirmDeleteBtn}
                    onClick={onDelete}
                  >
                    Yes, Delete Forever
                  </button>
                  <button
                    type="button"
                    className={styles.cancelDeleteBtn}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
