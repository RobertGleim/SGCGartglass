import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../services/api';
import styles from './TemplateFormModal.module.css';

let pdfjsLibLoader;
async function getPdfjsLib() {
  if (!pdfjsLibLoader) {
    pdfjsLibLoader = import('pdfjs-dist').then((module) => module.default || module);
  }
  return pdfjsLibLoader;
}

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
const TEMPLATE_MAX_FILE_BYTES = 50 * 1024 * 1024;

const createDefaultRelatedLinks = () => ({
  template_id: '',
  template_name: '',
  pattern_product_id: '',
  pattern_product_name: '',
  gallery_photo_id: '',
  gallery_panel_name: '',
  gallery_template_id: '',
});

const CATEGORY_TYPE_ALIASES = {
  pattern: 'patterns',
  patterns: 'patterns',
  stainedglasspanels: 'stainedGlassPanels',
  stainedglass: 'stainedGlassPanels',
  glass: 'stainedGlassPanels',
  fusedart: 'fusedArt',
  laserandsandblasting: 'laserAndSandblasting',
  laser: 'laserAndSandblasting',
  sandblast: 'laserAndSandblasting',
  sandblasting: 'laserAndSandblasting',
  woodart: 'woodArt',
  woodwork: 'woodArt',
  woodworking: 'woodArt',
  wood: 'woodArt',
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

const normalizeRelatedLinksForForm = (value) => ({
  ...createDefaultRelatedLinks(),
  ...(value && typeof value === 'object' ? value : {}),
  template_id: value?.template_id ? String(value.template_id) : '',
  pattern_product_id: value?.pattern_product_id ? String(value.pattern_product_id) : '',
  gallery_photo_id: value?.gallery_photo_id ? String(value.gallery_photo_id) : '',
  gallery_template_id: value?.gallery_template_id ? String(value.gallery_template_id) : '',
});

const buildRelatedLinksPayload = (relatedLinks) => {
  if (!relatedLinks || typeof relatedLinks !== 'object') {
    return null;
  }

  const payload = {
    template_id: relatedLinks.template_id ? Number(relatedLinks.template_id) : null,
    template_name: relatedLinks.template_name?.trim() || null,
    pattern_product_id: relatedLinks.pattern_product_id ? Number(relatedLinks.pattern_product_id) : null,
    pattern_product_name: relatedLinks.pattern_product_name?.trim() || null,
    gallery_photo_id: relatedLinks.gallery_photo_id ? Number(relatedLinks.gallery_photo_id) : null,
    gallery_panel_name: relatedLinks.gallery_panel_name?.trim() || null,
    gallery_template_id: relatedLinks.gallery_template_id ? Number(relatedLinks.gallery_template_id) : null,
  };

  const hasLinkedValue = Object.values(payload).some((entry) => entry !== null && entry !== '');
  return hasLinkedValue ? payload : null;
};

const inferProductType = (product) => {
  const categories = Array.isArray(product?.category)
    ? product.category
    : product?.category
      ? [product.category]
      : [];

  const explicitType = categories
    .map((entry) => CATEGORY_TYPE_ALIASES[
      String(entry || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    ])
    .find(Boolean);

  if (explicitType) return explicitType;

  const combined = [
    String(product?.category || '').toLowerCase(),
    String(product?.materials || '').toLowerCase(),
    String(product?.name || '').toLowerCase(),
    String(product?.description || '').toLowerCase(),
  ].join(' ');

  if (/pattern|template|svg|line\s*art|trace/.test(combined)) {
    return 'patterns';
  }
  return 'stainedGlassPanels';
};

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
  const pdfjsLib = await getPdfjsLib();
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
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
    is_digital_download: Boolean(template?.is_digital_download),
    price_amount: template?.price_amount ?? '',
    related_links: normalizeRelatedLinksForForm(template?.related_links),
  });
  const [templateOptions, setTemplateOptions] = useState([]);
  const [galleryOptions, setGalleryOptions] = useState([]);
  const [manualProducts, setManualProducts] = useState([]);
  const [fileType, setFileType] = useState(null); // 'svg' | 'image' | null (null = not yet chosen)
  const [previewUrl, setPreviewUrl] = useState(resolveImageUrl(template?.thumbnail_url || template?.image_url || ''));
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef();

  const patternProductOptions = useMemo(() => {
    const inferred = manualProducts
      .filter((entry) => inferProductType(entry) === 'patterns')
      .map((entry) => ({
        id: entry.id,
        name: (entry.name || `Pattern #${entry.id}`).trim(),
      }))
      .filter((entry) => entry.id);

    const source = inferred.length > 0
      ? inferred
      : manualProducts
        .map((entry) => ({
          id: entry.id,
          name: (entry.name || `Product #${entry.id}`).trim(),
        }))
        .filter((entry) => entry.id);

    const seen = new Set();
    return source.filter((entry) => {
      const key = String(entry.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [manualProducts]);

  const templateOptionCount = templateOptions.length;
  const patternOptionCount = patternProductOptions.length;
  const galleryOptionCount = galleryOptions.length;

  useEffect(() => {
    setForm({
      name: template?.name || '',
      category: template?.category || '',
      difficulty: template?.difficulty || DIFFICULTY_OPTIONS[0],
      dimensions: template?.dimensions || '',
      svg_content: template?.svg_content || '',
      image_url: template?.image_url || '',
      template_type: template?.template_type || 'svg',
      piece_count: template?.piece_count ?? 0,
      is_digital_download: Boolean(template?.is_digital_download),
      price_amount: template?.price_amount ?? '',
      related_links: normalizeRelatedLinksForForm(template?.related_links),
    });
    setPreviewUrl(resolveImageUrl(template?.thumbnail_url || template?.image_url || ''));
    setFileType(null);
    setError('');
    setConfirmDelete(false);
  }, [template, open]);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const loadLinkOptions = async () => {
      const templatesPromise = api.get('/templates');
      const galleryPromise = api.get('/admin/gallery/photos', { params: { page: 1, per_page: 50 } })
        .catch(() => api.get('/gallery/photos', { params: { page: 1, per_page: 50 } }));
      // Summary mode dramatically reduces payload size and avoids large-response failures.
      const manualProductsPromise = api.get('/manual-products', { params: { summary: 1 } });

      const [templatesResult, galleryResult, manualProductsResult] = await Promise.allSettled([
        templatesPromise,
        galleryPromise,
        manualProductsPromise,
      ]);

      if (!isMounted) return;

      const seenTemplateIds = new Set();
      const nextTemplateOptions = templatesResult.status === 'fulfilled'
        ? toArray(templatesResult.value)
          .filter((entry) => entry?.id)
          .map((entry) => ({
            id: entry.id,
            name: String(entry.name || `Template #${entry.id}`).trim(),
          }))
          .filter((entry) => {
            const key = String(entry.id);
            if (seenTemplateIds.has(key)) return false;
            seenTemplateIds.add(key);
            return true;
          })
        : [];

      const seenGalleryIds = new Set();
      const nextGalleryOptions = galleryResult.status === 'fulfilled'
        ? toArray(galleryResult.value)
          .filter((entry) => entry?.id)
          .map((entry) => ({
            id: entry.id,
            panel_name: String(entry.panel_name || `Photo #${entry.id}`).trim(),
            template_id: entry.template_id || null,
          }))
          .filter((entry) => {
            const key = String(entry.id);
            if (seenGalleryIds.has(key)) return false;
            seenGalleryIds.add(key);
            return true;
          })
        : [];

      const nextManualProducts = manualProductsResult.status === 'fulfilled'
        ? toArray(manualProductsResult.value)
        : [];

      if (templatesResult.status === 'rejected' || galleryResult.status === 'rejected' || manualProductsResult.status === 'rejected') {
        console.warn('Template related-link options loaded with partial failures.', {
          templatesError: templatesResult.status === 'rejected' ? templatesResult.reason : null,
          galleryError: galleryResult.status === 'rejected' ? galleryResult.reason : null,
          manualProductsError: manualProductsResult.status === 'rejected' ? manualProductsResult.reason : null,
        });
      }

      setTemplateOptions(nextTemplateOptions);
      setGalleryOptions(nextGalleryOptions);
      setManualProducts(nextManualProducts);
    };

    loadLinkOptions();
    return () => {
      isMounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose && onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  };

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
    if (file.size > TEMPLATE_MAX_FILE_BYTES) {
      setError('File too large to upload (max 50 MB). Please use a smaller file.');
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

  if (!open) return null;

  const handleFileChange = (e) => processFile(e.target.files[0]);
  const handleDrop = (e) => { e.preventDefault(); processFile(e.dataTransfer.files[0]); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.category.trim()) { setError('Tags are required'); return; }
    if (!form.dimensions.trim()) { setError('Dimensions is required'); return; }
    if (form.is_digital_download && (!String(form.price_amount).trim() || Number(form.price_amount) < 0.5)) {
      setError('Digital download templates require a price of at least $0.50');
      return;
    }

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
        is_digital_download: Boolean(form.is_digital_download),
        price_amount: form.is_digital_download ? Number(form.price_amount) : null,
        price_currency: 'USD',
        related_links: buildRelatedLinksPayload(form.related_links),
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

  const modalContent = (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2 className={styles.title}>{template ? 'Edit Template' : 'Add New Template'}</h2>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.labelText}>Name *</span>
            <input
              className={styles.textInput}
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.labelText}>Tags (comma-separated) *</span>
            <input
              className={styles.textInput}
              type="text"
              placeholder="e.g., Geometric, Contemporary, Blue"
              value={form.category}
              onChange={e => handleChange('category', e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.labelText}>Difficulty *</span>
            <select
              className={styles.selectInput}
              value={form.difficulty}
              onChange={e => handleChange('difficulty', e.target.value)}
            >
              {DIFFICULTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.labelText}>Dimensions *</span>
            <input
              className={styles.textInput}
              type="text"
              placeholder="e.g. 12×16 inches"
              value={form.dimensions}
              onChange={e => handleChange('dimensions', e.target.value)}
              required
            />
          </label>
          <label className={styles.checkboxField}>
            <input
              className={styles.checkboxInput}
              type="checkbox"
              checked={Boolean(form.is_digital_download)}
              onChange={e => handleChange('is_digital_download', e.target.checked)}
            />
            <span className={styles.checkboxText}>Sell as digital pattern download</span>
          </label>
          {form.is_digital_download && (
            <label className={styles.field}>
              <span className={styles.labelText}>Download price (USD) *</span>
              <input
                className={styles.textInput}
                type="number"
                min="0.5"
                step="0.01"
                placeholder="e.g. 24.99"
                value={form.price_amount}
                onChange={e => handleChange('price_amount', e.target.value)}
                required
              />
            </label>
          )}

          <div className={styles.productLinkingSection}>
            <h4>Related Customer Links</h4>
            <p className={styles.formNote}>
              Link this template to a template, pattern, or gallery entry so customers can jump straight to inspiration.
            </p>

            <label className={styles.field}>
              <span className={styles.labelText}>{`Linked Template (${templateOptionCount})`}</span>
              <select
                className={styles.selectInput}
                value={form.related_links?.template_id || ''}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const selectedTemplate = templateOptions.find(
                    (entry) => String(entry.id) === String(nextId),
                  );
                  setForm((prev) => ({
                    ...prev,
                    related_links: {
                      ...createDefaultRelatedLinks(),
                      ...prev.related_links,
                      template_id: nextId,
                      template_name: selectedTemplate?.name || '',
                    },
                  }));
                }}
              >
                <option value="">None</option>
                {templateOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.labelText}>{`Linked Pattern Product (${patternOptionCount})`}</span>
              <select
                className={styles.selectInput}
                value={form.related_links?.pattern_product_id || ''}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const selectedPattern = patternProductOptions.find(
                    (entry) => String(entry.id) === String(nextId),
                  );
                  setForm((prev) => ({
                    ...prev,
                    related_links: {
                      ...createDefaultRelatedLinks(),
                      ...prev.related_links,
                      pattern_product_id: nextId,
                      pattern_product_name: selectedPattern?.name || '',
                    },
                  }));
                }}
              >
                <option value="">None</option>
                {patternProductOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.labelText}>{`Linked Photo Gallery Entry (${galleryOptionCount})`}</span>
              <select
                className={styles.selectInput}
                value={form.related_links?.gallery_photo_id || ''}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const selectedPhoto = galleryOptions.find(
                    (entry) => String(entry.id) === String(nextId),
                  );
                  setForm((prev) => ({
                    ...prev,
                    related_links: {
                      ...createDefaultRelatedLinks(),
                      ...prev.related_links,
                      gallery_photo_id: nextId,
                      gallery_panel_name: selectedPhoto?.panel_name || '',
                      gallery_template_id: selectedPhoto?.template_id
                        ? String(selectedPhoto.template_id)
                        : '',
                    },
                  }));
                }}
              >
                <option value="">None</option>
                {galleryOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.panel_name || `Photo #${entry.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                  <span className={styles.uploadTypes}>SVG · PDF · JPEG · PNG (max 50 MB)</span>
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

  return createPortal(modalContent, document.body);
}
