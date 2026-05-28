import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import LoadingMessage from '../../components/LoadingMessage';
import Pagination from '../../components/Pagination';
import TemplateFormModal from './components/TemplateFormModal';
import styles from './TemplateManagement.module.css';

const PAGE_SIZE = 10;
const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];
const COMMON_TAGS = ['Pattern', 'Custom', 'Geometric', 'Contemporary', 'Traditional', 'Abstract', 'Floral', 'Animal', 'Religious'];

// Resolve relative URLs to backend origin
const BACKEND_ORIGIN = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '') || '';
const resolveImageUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^javascript:/i.test(raw)) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

  if (
    (raw.startsWith('[') && raw.endsWith(']'))
    || (raw.startsWith('{') && raw.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return resolveImageUrl(parsed[0]?.image_url || parsed[0]?.url || parsed[0]?.src || parsed[0]);
      }
      if (parsed && typeof parsed === 'object') {
        return resolveImageUrl(parsed.image_url || parsed.url || parsed.src);
      }
    } catch {
      // Use the raw value below if parsing fails.
    }
  }

  if (raw.startsWith('/uploads/')) return `${BACKEND_ORIGIN}${raw}`;
  if (raw.startsWith('uploads/')) return `${BACKEND_ORIGIN}/${raw}`;
  if (raw.startsWith('/')) return `${BACKEND_ORIGIN}${raw}`;
  return `${BACKEND_ORIGIN}/${raw}`;
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

const openTemplateDefaultsDesigner = (templateId) => {
  if (!templateId) return;
  window.location.hash = `#/designer?template=${templateId}&mode=template-defaults`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

export default function TemplateManagement() {
  const [templates, setTemplates] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [convertTemplateId, setConvertTemplateId] = useState('');
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertForm, setConvertForm] = useState({
    description: '',
    price: '',
    quantity: '999',
    isDigitalDownload: true,
    isFeatured: false,
    categories: 'Patterns',
    materials: '',
  });
  const [isConvertingToPattern, setIsConvertingToPattern] = useState(false);
  const [convertStatus, setConvertStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  const createDefaultRelatedLinks = () => ({
    template_id: null,
    template_name: null,
    pattern_product_id: null,
    pattern_product_name: null,
    linked_product_id: null,
    linked_product_name: null,
    gallery_photo_id: null,
    gallery_panel_name: null,
    gallery_template_id: null,
  });

  const toRelatedLinksPayload = (relatedLinks) => {
    const normalized = {
      ...createDefaultRelatedLinks(),
      ...(relatedLinks && typeof relatedLinks === 'object' ? relatedLinks : {}),
    };

    const payload = {
      template_id: normalized.template_id ? Number(normalized.template_id) : null,
      template_name: String(normalized.template_name || '').trim() || null,
      pattern_product_id: normalized.pattern_product_id ? Number(normalized.pattern_product_id) : null,
      pattern_product_name: String(normalized.pattern_product_name || '').trim() || null,
      linked_product_id: normalized.linked_product_id ? Number(normalized.linked_product_id) : null,
      linked_product_name: String(normalized.linked_product_name || '').trim() || null,
      gallery_photo_id: normalized.gallery_photo_id ? Number(normalized.gallery_photo_id) : null,
      gallery_panel_name: String(normalized.gallery_panel_name || '').trim() || null,
      gallery_template_id: normalized.gallery_template_id ? Number(normalized.gallery_template_id) : null,
    };

    const hasValue = Object.values(payload).some((entry) => entry !== null && entry !== '');
    return hasValue ? payload : null;
  };

  useEffect(() => {
    async function fetchTemplates() {
      setLoading(true);
      try {
        const res = await api.get('/admin/templates');
        setTemplates(toArray(res));
      } catch {
        window.toast && window.toast('Failed to load templates', { type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  // Search
  const filtered = templates.filter((t) => String(t?.name || '').toLowerCase().includes(search.toLowerCase()));
  // Pagination
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getTemplateForConversion = () => templates.find(
    (entry) => Number(entry?.id || 0) === Number(convertTemplateId || 0),
  );

  const getDefaultConvertForm = (template) => {
    const templateName = String(template?.name || '').trim();
    const templateDescription = String(template?.description || '').trim();
    const templatePrice = Number(template?.price_amount || 0);
    return {
      description: templateDescription || (templateName ? `Digital pattern based on ${templateName}` : ''),
      price: Number.isFinite(templatePrice) && templatePrice > 0 ? String(templatePrice) : '',
      quantity: '999',
      isDigitalDownload: true,
      isFeatured: false,
      categories: 'Patterns',
      materials: '',
    };
  };

  // Bulk activate/deactivate
  const handleBulk = async (is_active) => {
    if (selected.length === 0) return;
    try {
      await Promise.all(selected.map(id => api.put(`/admin/templates/${id}`, { is_active })));
      setTemplates(prev => prev.map(t => selected.includes(t.id) ? { ...t, is_active } : t));
      setSelected([]);
      window.toast && window.toast('Status updated', { type: 'success' });
    } catch {
      window.toast && window.toast('Bulk update failed', { type: 'error' });
    }
  };

  // Toggle active/inactive for a single template
  const handleToggleActive = async (id, currentlyActive) => {
    const newStatus = !currentlyActive;
    try {
      await api.put(`/admin/templates/${id}`, { is_active: newStatus });
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: newStatus } : t));
      window.toast && window.toast(newStatus ? 'Template activated' : 'Template deactivated', { type: 'success' });
    } catch {
      window.toast && window.toast('Status update failed', { type: 'error' });
    }
  };

  const handleOpenConvertForm = () => {
    const template = getTemplateForConversion();
    if (!template) {
      setConvertStatus('Select a template first.');
      return;
    }
    setConvertForm(getDefaultConvertForm(template));
    setShowConvertForm(true);
    setConvertStatus('');
  };

  const handleConvertTemplateToPattern = async () => {
    if (isConvertingToPattern) return;

    const template = getTemplateForConversion();
    const templateId = Number(template?.id || 0);
    if (!templateId || !template) {
      setConvertStatus('Select a template to convert first.');
      return;
    }

    const nextDescription = String(convertForm.description || '').trim();
    if (!nextDescription) {
      setConvertStatus('Pattern description is required.');
      return;
    }

    const nextPrice = Number(convertForm.price);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setConvertStatus('Enter a valid price (0 or greater).');
      return;
    }

    if (convertForm.isDigitalDownload && nextPrice < 0.5) {
      setConvertStatus('Digital download patterns require a price of at least $0.50.');
      return;
    }

    const nextQuantity = parseInt(String(convertForm.quantity || '0'), 10);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      setConvertStatus('Quantity must be at least 1.');
      return;
    }

    const templateName = String(template.name || `Template #${templateId}`).trim();
    if (!templateName) {
      setConvertStatus('Template name is required before conversion.');
      return;
    }

    setIsConvertingToPattern(true);
    setConvertStatus('Converting template to pattern...');
    try {
      const baseLinks = {
        ...createDefaultRelatedLinks(),
        ...(template.related_links && typeof template.related_links === 'object'
          ? template.related_links
          : {}),
      };

      const existingPatternId = Number(baseLinks.pattern_product_id || 0) || null;
      const imageUrl = String(template.thumbnail_url || template.image_url || '').trim();
      const parsedCategories = String(convertForm.categories || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const parsedMaterials = String(convertForm.materials || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const categories = parsedCategories.length > 0 ? parsedCategories : ['Patterns'];

      const patternPayload = {
        name: templateName,
        description: nextDescription,
        category: categories,
        materials: parsedMaterials.length > 0 ? parsedMaterials : null,
        width: null,
        height: null,
        depth: null,
        price: Number(nextPrice.toFixed(2)),
        old_price: null,
        discount_percent: null,
        quantity: nextQuantity,
        is_featured: Boolean(convertForm.isFeatured),
        is_digital_download: Boolean(convertForm.isDigitalDownload),
        related_links: toRelatedLinksPayload({
          ...baseLinks,
          template_id: templateId,
          template_name: templateName,
          pattern_product_id: existingPatternId,
          pattern_product_name: templateName,
          gallery_template_id: baseLinks.gallery_photo_id ? templateId : baseLinks.gallery_template_id,
        }),
        images: imageUrl
          ? [{ image_url: imageUrl, media_type: 'image' }]
          : [],
      };

      const savedPattern = existingPatternId
        ? await api.put(`/manual-products/${existingPatternId}`, patternPayload)
        : await api.post('/manual-products', patternPayload);

      const savedPatternId = Number(savedPattern?.id || existingPatternId || 0);
      if (!savedPatternId) {
        throw new Error('Pattern conversion did not return a valid product id.');
      }

      const syncedLinks = {
        ...baseLinks,
        template_id: templateId,
        template_name: templateName,
        pattern_product_id: savedPatternId,
        pattern_product_name: String(savedPattern?.name || templateName).trim(),
        gallery_template_id: baseLinks.gallery_photo_id ? templateId : baseLinks.gallery_template_id,
      };

      await api.put(`/admin/templates/${templateId}`, {
        related_links: toRelatedLinksPayload(syncedLinks),
      });

      const linkedProductId = Number(baseLinks.linked_product_id || 0);
      if (linkedProductId && linkedProductId !== savedPatternId) {
        const linkedProduct = await api.get(`/manual-products/${linkedProductId}`);
        const linkedProductLinks = {
          ...createDefaultRelatedLinks(),
          ...(linkedProduct?.related_links && typeof linkedProduct.related_links === 'object'
            ? linkedProduct.related_links
            : {}),
          ...syncedLinks,
          linked_product_id: linkedProductId,
          linked_product_name: String(
            syncedLinks.linked_product_name || linkedProduct?.name || '',
          ).trim() || null,
        };

        await api.put(`/manual-products/${linkedProductId}`, {
          related_links: toRelatedLinksPayload(linkedProductLinks),
        });
      }

      const galleryPhotoId = Number(baseLinks.gallery_photo_id || 0);
      if (galleryPhotoId) {
        await api.put(`/admin/gallery/photos/${galleryPhotoId}`, {
          template_id: templateId,
        });
      }

      setTemplates((prev) => prev.map((entry) => (
        entry.id === templateId
          ? {
            ...entry,
            related_links: toRelatedLinksPayload(syncedLinks),
          }
          : entry
      )));
      setShowConvertForm(false);
      setConvertStatus(`Pattern created from ${templateName}. All associated links were synced.`);
      window.toast && window.toast('Template converted to pattern', { type: 'success' });
    } catch (error) {
      const message =
        error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || 'Failed to convert template to pattern.';
      setConvertStatus(`Error: ${message}`);
      window.toast && window.toast('Template to pattern conversion failed', { type: 'error' });
    } finally {
      setIsConvertingToPattern(false);
    }
  };

  // Permanently delete a template (called from edit modal)
  const handlePermanentDelete = async (id) => {
    try {
      await api.delete(`/admin/templates/${id}?hard=true`);
      setTemplates(prev => prev.filter(t => t.id !== id));
      setSelected(prev => prev.filter(sid => sid !== id));
      setShowModal(false);
      window.toast && window.toast('Template permanently deleted', { type: 'success' });
    } catch {
      window.toast && window.toast('Delete failed', { type: 'error' });
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Template Management</h1>
      <div className={styles.topBar}>
        <button className={styles.addBtn} onClick={() => { setEditTemplate(null); setShowModal(true); }}>Add New Template</button>
        <input className={styles.search} placeholder="Search by name" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={styles.bulkBtn} onClick={() => handleBulk(true)}>Activate Selected</button>
        <button className={styles.bulkBtn} onClick={() => handleBulk(false)}>Deactivate Selected</button>
      </div>
      <div className={styles.convertBar}>
        <h3 className={styles.convertTitle}>Convert Template to Pattern</h3>
        <p className={styles.convertNote}>
          Select a template to create or update a linked pattern product. Related template, linked product, and gallery links are preserved.
        </p>
        <div className={styles.convertControls}>
          <select
            className={styles.convertSelect}
            value={convertTemplateId}
            onChange={(event) => {
              setConvertTemplateId(event.target.value);
              setConvertStatus('');
            }}
            disabled={isConvertingToPattern || templates.length === 0}
          >
            <option value="">Select a template...</option>
            {templates.map((templateEntry) => (
              <option key={templateEntry.id} value={templateEntry.id}>
                {String(templateEntry.name || `Template #${templateEntry.id}`).trim()}
              </option>
            ))}
          </select>
          <button
            className={styles.convertBtn}
            type="button"
            onClick={handleOpenConvertForm}
            disabled={isConvertingToPattern || !convertTemplateId}
          >
            Add Pattern Details
          </button>
        </div>
        {showConvertForm ? (
          <form
            className={styles.convertForm}
            onSubmit={(event) => {
              event.preventDefault();
              handleConvertTemplateToPattern();
            }}
          >
            <label className={styles.convertField}>
              <span>Description *</span>
              <textarea
                rows={2}
                value={convertForm.description}
                onChange={(event) => setConvertForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))}
                placeholder="Short sellable description for the pattern"
              />
            </label>
            <div className={styles.convertGrid}>
              <label className={styles.convertField}>
                <span>Price (USD) *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={convertForm.price}
                  onChange={(event) => setConvertForm((prev) => ({
                    ...prev,
                    price: event.target.value,
                  }))}
                  placeholder="0.00"
                />
              </label>
              <label className={styles.convertField}>
                <span>Quantity *</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={convertForm.quantity}
                  onChange={(event) => setConvertForm((prev) => ({
                    ...prev,
                    quantity: event.target.value,
                  }))}
                />
              </label>
            </div>
            <div className={styles.convertGrid}>
              <label className={styles.convertField}>
                <span>Categories</span>
                <input
                  type="text"
                  value={convertForm.categories}
                  onChange={(event) => setConvertForm((prev) => ({
                    ...prev,
                    categories: event.target.value,
                  }))}
                  placeholder="Patterns, Geometric"
                />
              </label>
              <label className={styles.convertField}>
                <span>Materials</span>
                <input
                  type="text"
                  value={convertForm.materials}
                  onChange={(event) => setConvertForm((prev) => ({
                    ...prev,
                    materials: event.target.value,
                  }))}
                  placeholder="PDF, SVG, Printable"
                />
              </label>
            </div>
            <div className={styles.convertChecks}>
              <label>
                <input
                  type="checkbox"
                  checked={convertForm.isDigitalDownload}
                  onChange={(event) => setConvertForm((prev) => ({
                    ...prev,
                    isDigitalDownload: event.target.checked,
                  }))}
                />
                <span>Digital download</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={convertForm.isFeatured}
                  onChange={(event) => setConvertForm((prev) => ({
                    ...prev,
                    isFeatured: event.target.checked,
                  }))}
                />
                <span>Featured</span>
              </label>
            </div>
            <div className={styles.convertActions}>
              <button
                className={styles.convertBtn}
                type="submit"
                disabled={isConvertingToPattern}
              >
                {isConvertingToPattern ? 'Converting...' : 'Create Pattern From Template'}
              </button>
              <button
                className={styles.convertCancelBtn}
                type="button"
                onClick={() => {
                  setShowConvertForm(false);
                  setConvertStatus('');
                }}
                disabled={isConvertingToPattern}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        {convertStatus ? <p className={styles.convertStatus}>{convertStatus}</p> : null}
      </div>
      {loading ? <LoadingMessage label="Loading" /> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th><input className={styles.checkbox} type="checkbox" onChange={e => setSelected(e.target.checked ? paged.map(t => t.id) : [])} /></th>
              <th>Thumbnail</th>
              <th>Name</th>
              <th>Category</th>
              <th>Difficulty</th>
              <th>Dimensions</th>
              <th>Piece Count</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(t => (
              <tr key={t.id}>
                <td><input className={styles.checkbox} type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))} /></td>
                <td>
                  {(t.thumbnail_url || t.image_url) ? (
                    <img src={resolveImageUrl(t.thumbnail_url || t.image_url)} alt={t.name} className={styles.thumb} loading="lazy" decoding="async" fetchPriority="low" />
                  ) : t.svg_content ? (
                    <img src={`data:image/svg+xml;base64,${btoa(t.svg_content)}`} alt={t.name} className={styles.thumb} loading="lazy" decoding="async" fetchPriority="low" />
                  ) : (
                    <div className={styles.thumbPlaceholder}>✦</div>
                  )}
                </td>
                <td>{t.name}</td>
                <td>{t.category}</td>
                <td>{t.difficulty}</td>
                <td>{t.dimensions}</td>
                <td>{t.piece_count ?? t.pieceCount}</td>
                <td>
                  <span className={`${styles.statusBadge} ${(t.is_active ?? t.active) ? styles.statusActive : styles.statusInactive}`}>
                    {(t.is_active ?? t.active) ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className={styles.actionsCell}>
                  <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => { setEditTemplate(t); setShowModal(true); }}>Edit</button>
                  <button className={`${styles.actionBtn} ${styles.linkBtn}`} onClick={() => openTemplateDefaultsDesigner(t.id)}>Pre-color / Lock</button>
                  {(t.is_active ?? t.active) ? (
                    <button className={styles.deactivateBtn} onClick={() => handleToggleActive(t.id, true)}>Deactivate</button>
                  ) : (
                    <button className={styles.activateBtn} onClick={() => handleToggleActive(t.id, false)}>Activate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination
        currentPage={page}
        totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
        onPageChange={setPage}
        ariaLabel="Template pages"
        metaText={`Page ${page} of ${Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}`}
      />
      {showModal && (
        <TemplateFormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          template={editTemplate}
          onDelete={editTemplate ? () => handlePermanentDelete(editTemplate.id) : undefined}
          onSuccess={(updated) => {
            setShowModal(false);
            if (editTemplate && updated) {
              setTemplates(prev => prev.map(t => t.id === editTemplate.id ? { ...t, ...updated } : t));
            } else {
              // New template added — refetch
              api.get('/admin/templates').then((res) => setTemplates(toArray(res)));
            }
          }}
        />
      )}
    </div>
  );
}
