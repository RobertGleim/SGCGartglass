import React, { useState, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
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
  const viewport = page.getViewport({ scale: 2 });
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
  const [previewUrl, setPreviewUrl] = useState(template?.thumbnail_url || template?.image_url || '');
  const [uploading, setUploading] = useState(false);
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

    // PDF or raster image — upload to server
    setUploading(true);
    try {
      let uploadFile = file;

      if (isPDF) {
        setUploadProgress('Rendering PDF — page 1…');
        const blob = await pdfToBlob(file);
        const pngName = file.name.replace(/\.pdf$/i, '.png');
        uploadFile = new File([blob], pngName, { type: 'image/png' });
        setPreviewUrl(URL.createObjectURL(blob));
      } else {
        setPreviewUrl(URL.createObjectURL(file));
      }

      setUploadProgress('Uploading to server…');
      const imageUrl = await uploadImageFile(uploadFile, uploadFile.name);

      setPreviewUrl(`${getApiOrigin()}${imageUrl}`);
      setFileType('image');
      setForm(f => ({
        ...f,
        image_url: imageUrl,
        svg_content: '',
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
  const canSubmit = form.name && form.category && form.dimensions && hasContent && !uploading && !loading;

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
                ✓ SVG — customers can color individual glass pieces
                {form.piece_count > 0 && ` · ${form.piece_count} pieces detected`}
              </div>
            )}
            {currentType === 'image' && (
              <div className={`${styles.fileTypeBadge} ${styles.badgeImage}`}>
                ✓ Image — displayed as a design guide for customers to trace
              </div>
            )}
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className={styles.previewWrap}>
              <img src={previewUrl} alt="Template preview" className={styles.thumb} />
            </div>
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
