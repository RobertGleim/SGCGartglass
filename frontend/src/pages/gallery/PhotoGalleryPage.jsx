import { useEffect, useMemo, useRef, useState } from 'react';
import useAuth from '../../hooks/useAuth';
import useCustomerAuth from '../../hooks/useCustomerAuth';
import { fetchCustomerProfile, fetchManualProducts, getGalleryPhotos, getTemplates, submitGalleryPhoto } from '../../services/api';
import styles from './PhotoGalleryPage.module.css';

const getInitialTemplateIdFromHash = () => {
  const raw = window.location.hash || '';
  const idx = raw.indexOf('?');
  if (idx === -1) return '';
  const params = new URLSearchParams(raw.slice(idx + 1));
  return params.get('template_id') || params.get('template') || '';
};

const getInitialPhotoIdFromHash = () => {
  const raw = window.location.hash || '';
  const idx = raw.indexOf('?');
  if (idx === -1) return '';
  const params = new URLSearchParams(raw.slice(idx + 1));
  return params.get('photo_id') || params.get('gallery_photo_id') || '';
};

const getLinkedParamsFromHash = () => {
  const raw = window.location.hash || '';
  const idx = raw.indexOf('?');
  if (idx === -1) return {};
  const params = new URLSearchParams(raw.slice(idx + 1));
  return {
    template_id: params.get('template') || params.get('template_id') || '',
    pattern_product_id: params.get('pattern_product_id') || '',
    gallery_photo_id: params.get('gallery_photo_id') || params.get('photo_id') || '',
    gallery_template_id: params.get('gallery_template_id') || '',
  };
};

const getApiOrigin = () => {
  const configuredBase = import.meta.env.VITE_API_BASE_URL || '/api';
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '');
  }
  return window.location.origin;
};

const resolveGalleryImageUrl = (value) => {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${getApiOrigin()}${value}`;
  return `${getApiOrigin()}/${value}`;
};

export default function PhotoGalleryPage() {
  const { authToken } = useAuth();
  const { customerToken } = useCustomerAuth();
  const isSignedIn = Boolean(authToken || customerToken);

  const [photos, setPhotos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(getInitialTemplateIdFromHash());
  const [selectedPhotoId, setSelectedPhotoId] = useState(getInitialPhotoIdFromHash());
  const [manualProducts, setManualProducts] = useState([]);
  const [linkedParams, setLinkedParams] = useState(getLinkedParamsFromHash());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [form, setForm] = useState({
    panel_name: '',
    description: '',
    category: '',
    template_id: '',
    display_name: '',
    hide_submitter_name: false,
  });
  const [defaultDisplayName, setDefaultDisplayName] = useState('');
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerGroup, setViewerGroup] = useState(null);
  const fileInputRef = useRef(null);
  const activeViewerPhoto = viewerPhotos[viewerIndex] || null;

  useEffect(() => {
    if (!photoFiles.length) {
      setPhotoPreviewUrls([]);
      return;
    }
    const urls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);

  const loadPhotos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getGalleryPhotos({
        category: selectedCategory || undefined,
        template_id: selectedTemplateId || undefined,
        photo_id: selectedPhotoId || undefined,
      });
      let items = Array.isArray(response?.items) ? response.items : [];
      let categories = Array.isArray(response?.categories) ? response.categories : [];
      let templatesFromResponse = Array.isArray(response?.templates) ? response.templates : [];

      // Always anchor linked gallery navigation by photo ID (and its submission group),
      // even if backend photo_id filtering is unavailable or stale.
      if (selectedPhotoId) {
        const linkedId = String(selectedPhotoId);
        let targetPhoto = items.find((entry) => String(entry?.id) === linkedId);

        if (!targetPhoto) {
          const fallbackResponse = await getGalleryPhotos();
          const fallbackItems = Array.isArray(fallbackResponse?.items) ? fallbackResponse.items : [];
          targetPhoto = fallbackItems.find((entry) => String(entry?.id) === linkedId);
          if (targetPhoto) {
            items = fallbackItems;
            categories = Array.isArray(fallbackResponse?.categories) ? fallbackResponse.categories : categories;
            const fallbackTemplates = Array.isArray(fallbackResponse?.templates) ? fallbackResponse.templates : [];
            if (fallbackTemplates.length > 0) {
              templatesFromResponse = fallbackTemplates;
            }
          }
        }

        if (targetPhoto) {
          const targetGroupId = String(targetPhoto?.submission_group_id || targetPhoto?.id || '');
          items = items.filter(
            (entry) => String(entry?.submission_group_id || entry?.id || '') === targetGroupId,
          );
        } else {
          items = [];
        }
      }

      setPhotos(items);
      setCategories(categories);
      if (templatesFromResponse.length > 0) {
        setTemplates(templatesFromResponse);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load gallery photos.');
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getTemplates()
      .then((res) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        if (items.length > 0) {
          setTemplates(items.map((template) => ({ id: template.id, name: template.name })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchManualProducts({ summary: 1 })
      .then((items) => {
        setManualProducts(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        setManualProducts([]);
      });
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      setSelectedTemplateId(getInitialTemplateIdFromHash());
      setSelectedPhotoId(getInitialPhotoIdFromHash());
      setLinkedParams(getLinkedParamsFromHash());
    };
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [selectedCategory, selectedTemplateId, selectedPhotoId]);

  useEffect(() => {
    if (!customerToken) {
      setDefaultDisplayName('');
      return;
    }
    fetchCustomerProfile()
      .then((profile) => {
        const firstName = String(profile?.first_name || '').trim();
        setDefaultDisplayName(firstName);
        setForm((prev) => ({
          ...prev,
          display_name: prev.display_name || firstName,
        }));
      })
      .catch(() => {});
  }, [customerToken]);

  const descriptionLength = form.description.length;

  const formatTimestamp = (value) => {
    if (!value) return '-';
    const raw = String(value);
    const hasTz = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw);
    const normalized = hasTz ? raw : `${raw}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return '-';
    return `${new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(d)}`;
  };

  const templateNameMap = useMemo(() => {
    const byId = new Map();
    templates.forEach((template) => byId.set(String(template.id), template.name));
    return byId;
  }, [templates]);

  const resetSubmitState = () => {
    setForm({
      panel_name: '',
      description: '',
      category: '',
      template_id: '',
      display_name: defaultDisplayName,
      hide_submitter_name: false,
    });
    setPhotoFiles([]);
    setSubmitError('');
  };

  const closeSubmitModal = () => {
    setShowSubmitModal(false);
    resetSubmitState();
  };

  const mergeIncomingFiles = (incomingFiles) => {
    const safeFiles = Array.from(incomingFiles || []).filter(Boolean);
    if (!safeFiles.length) return;
    setPhotoFiles((prev) => {
      const merged = [...prev, ...safeFiles].slice(0, 5);
      if (prev.length + safeFiles.length > 5) {
        setSubmitError('You can upload up to 5 photos per submission.');
      } else {
        setSubmitError('');
      }
      return merged;
    });
  };

  const removeSelectedFileAt = (indexToRemove) => {
    setPhotoFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    setSubmitError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const groupedPhotos = useMemo(() => {
    const groups = new Map();
    photos.forEach((photo) => {
      const groupId = photo.submission_group_id || String(photo.id);
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          panel_name: photo.panel_name,
          description: photo.description,
          category: photo.category,
          template_id: photo.template_id,
          template_name: photo.template_name,
          created_at: photo.created_at,
          photos: [],
        });
      }
      groups.get(groupId).photos.push(photo);
    });
    return Array.from(groups.values()).map((group) => {
      const ordered = [...group.photos].sort((left, right) => {
        const leftCover = left.is_cover ? 1 : 0;
        const rightCover = right.is_cover ? 1 : 0;
        if (leftCover !== rightCover) {
          return rightCover - leftCover;
        }
        const leftTime = new Date(left.created_at || 0).getTime();
        const rightTime = new Date(right.created_at || 0).getTime();
        return leftTime - rightTime;
      });
      return {
        ...group,
        photos: ordered,
      };
    });
  }, [photos]);

  const linkedProduct = useMemo(() => {
    const patternId = String(linkedParams.pattern_product_id || '').trim();
    if (patternId) {
      const byPatternId = manualProducts.find((entry) => String(entry?.id || '') === patternId);
      if (byPatternId) return byPatternId;
    }

    const linkedPhotoId = String(linkedParams.gallery_photo_id || selectedPhotoId || '').trim();
    if (linkedPhotoId) {
      const byGallery = manualProducts.find(
        (entry) => String(entry?.related_links?.gallery_photo_id || '') === linkedPhotoId,
      );
      if (byGallery) return byGallery;
    }

    const templateId = String(linkedParams.template_id || selectedTemplateId || '').trim();
    if (templateId) {
      const byTemplate = manualProducts.find(
        (entry) => String(entry?.related_links?.template_id || '') === templateId,
      );
      if (byTemplate) return byTemplate;
    }

    return null;
  }, [linkedParams, manualProducts, selectedPhotoId, selectedTemplateId]);

  const linkedResources = useMemo(() => {
    const source = linkedProduct?.related_links || {};
    const templateId = String(linkedParams.template_id || source.template_id || selectedTemplateId || '').trim();
    const patternProductId = String(linkedParams.pattern_product_id || source.pattern_product_id || linkedProduct?.id || '').trim();
    const galleryPhotoId = String(linkedParams.gallery_photo_id || source.gallery_photo_id || selectedPhotoId || '').trim();
    const galleryTemplateId = String(source.gallery_template_id || linkedParams.gallery_template_id || selectedTemplateId || templateId || '').trim();

    return {
      template_id: templateId,
      template_name: source.template_name || '',
      pattern_product_id: patternProductId,
      pattern_product_name: source.pattern_product_name || linkedProduct?.name || '',
      gallery_photo_id: galleryPhotoId,
      gallery_panel_name: source.gallery_panel_name || '',
      gallery_template_id: galleryTemplateId,
    };
  }, [linkedParams, linkedProduct, selectedPhotoId, selectedTemplateId]);

  const viewerLinkedProduct = useMemo(() => {
    if (!activeViewerPhoto) return null;

    const activePhotoId = String(activeViewerPhoto?.id || '').trim();
    if (activePhotoId) {
      const byPhotoId = manualProducts.find(
        (entry) => String(entry?.related_links?.gallery_photo_id || '') === activePhotoId,
      );
      if (byPhotoId) return byPhotoId;
    }

    const templateId = String(activeViewerPhoto?.template_id || viewerGroup?.template_id || '').trim();
    if (templateId) {
      const byTemplateId = manualProducts.find(
        (entry) => String(entry?.related_links?.template_id || '') === templateId,
      );
      if (byTemplateId) return byTemplateId;
    }

    return null;
  }, [activeViewerPhoto, manualProducts, viewerGroup]);

  const viewerLinkedResources = useMemo(() => {
    const source = viewerLinkedProduct?.related_links || {};
    const activePhotoId = String(activeViewerPhoto?.id || '').trim();
    const useRouteLinksForViewer = Boolean(
      activePhotoId
      && linkedResources.gallery_photo_id
      && String(linkedResources.gallery_photo_id) === activePhotoId,
    );

    const templateId = String(
      source.template_id
      || (useRouteLinksForViewer ? linkedResources.template_id : '')
      || activeViewerPhoto?.template_id
      || viewerGroup?.template_id
      || '',
    ).trim();
    const patternProductId = String(
      source.pattern_product_id
      || (useRouteLinksForViewer ? linkedResources.pattern_product_id : '')
      || viewerLinkedProduct?.id
      || '',
    ).trim();
    const galleryPhotoId = String(
      source.gallery_photo_id
      || activePhotoId
      || (useRouteLinksForViewer ? linkedResources.gallery_photo_id : '')
      || '',
    ).trim();
    const galleryTemplateId = String(
      source.gallery_template_id
      || (useRouteLinksForViewer ? linkedResources.gallery_template_id : '')
      || templateId
      || '',
    ).trim();

    return {
      template_id: templateId,
      template_name: source.template_name || (useRouteLinksForViewer ? linkedResources.template_name : '') || '',
      pattern_product_id: patternProductId,
      pattern_product_name: source.pattern_product_name || viewerLinkedProduct?.name || (useRouteLinksForViewer ? linkedResources.pattern_product_name : '') || '',
      gallery_photo_id: galleryPhotoId,
      gallery_panel_name: source.gallery_panel_name || activeViewerPhoto?.panel_name || (useRouteLinksForViewer ? linkedResources.gallery_panel_name : '') || '',
      gallery_template_id: galleryTemplateId,
    };
  }, [activeViewerPhoto, linkedResources, viewerGroup, viewerLinkedProduct]);

  const viewerDesignerHref = useMemo(() => {
    if (!viewerLinkedResources.template_id) return '';
    const params = new URLSearchParams();
    params.set('template', viewerLinkedResources.template_id);
    if (viewerLinkedResources.pattern_product_id) params.set('pattern_product_id', viewerLinkedResources.pattern_product_id);
    if (viewerLinkedResources.gallery_photo_id) params.set('gallery_photo_id', viewerLinkedResources.gallery_photo_id);
    if (viewerLinkedResources.gallery_template_id) params.set('gallery_template_id', viewerLinkedResources.gallery_template_id);
    return `#/designer?${params.toString()}`;
  }, [viewerLinkedResources]);

  const viewerPatternHref = viewerLinkedResources.pattern_product_id
    ? `#/product/m-${viewerLinkedResources.pattern_product_id}`
    : '';

  const viewerGalleryHref = useMemo(() => {
    if (!viewerLinkedResources.gallery_photo_id) return '';
    const params = new URLSearchParams();
    params.set('photo_id', viewerLinkedResources.gallery_photo_id);
    if (viewerLinkedResources.gallery_template_id) params.set('template_id', viewerLinkedResources.gallery_template_id);
    if (viewerLinkedResources.template_id) params.set('template', viewerLinkedResources.template_id);
    if (viewerLinkedResources.pattern_product_id) params.set('pattern_product_id', viewerLinkedResources.pattern_product_id);
    return `#/gallery?${params.toString()}`;
  }, [viewerLinkedResources]);

  const viewerHasLinkedResources = Boolean(
    viewerLinkedResources.template_id
      || viewerLinkedResources.pattern_product_id
      || viewerLinkedResources.gallery_photo_id,
  );

  const handleDrop = (event) => {
    event.preventDefault();
    mergeIncomingFiles(event.dataTransfer?.files || []);
  };

  const handleFileBrowse = (event) => {
    mergeIncomingFiles(event.target.files || []);
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    if (!photoFiles.length) {
      setSubmitError('Please choose at least one photo file.');
      return;
    }
    if (!form.panel_name.trim()) {
      setSubmitError('Panel name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('panel_name', form.panel_name.trim());
      payload.append('description', form.description.trim());
      payload.append('category', form.category.trim());
      payload.append('template_id', form.template_id || '');
      payload.append('display_name', (form.display_name || '').trim());
      payload.append('hide_submitter_name', form.hide_submitter_name ? 'true' : 'false');
      photoFiles.forEach((file) => {
        payload.append('photos', file);
      });
      await submitGalleryPhoto(payload);
      closeSubmitModal();
      await loadPhotos();
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || err?.message || 'Failed to submit photo.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerPhotos([]);
    setViewerGroup(null);
    setViewerIndex(0);
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Photo Gallery</h1>
          <p className={styles.subtitle}>Browse all finished panels, categories, and template-linked results.</p>
        </div>
        {isSignedIn && (
          <button
            className={styles.submitTopBtn}
            type="button"
            onClick={() => {
              setShowSubmitModal(true);
              setForm((prev) => ({
                ...prev,
                template_id: selectedTemplateId || prev.template_id,
                display_name: prev.display_name || defaultDisplayName,
              }));
            }}
          >
            Submit Photo
          </button>
        )}
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label htmlFor="gallery-category">Category</label>
          <select
            id="gallery-category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={styles.resetBtn}
          onClick={() => {
            setSelectedCategory('');
            setSelectedTemplateId('');
            setSelectedPhotoId('');
          }}
        >
          Reset Filters
        </button>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <span className={styles.loadingLabel}>Loading gallery</span>
          <span className={styles.loadingDots} aria-hidden="true">
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
          </span>
        </div>
      ) : error ? (
        <div className={styles.errorState}>{error}</div>
      ) : groupedPhotos.length === 0 ? (
        <div className={styles.emptyState}>No photos found for this filter.</div>
      ) : (
        <div className={styles.grid}>
          {groupedPhotos.map((group) => (
            <article
              key={group.id}
              className={styles.card}
              onClick={() => {
                setViewerPhotos(group.photos);
                setViewerIndex(0);
                setViewerGroup(group);
                setViewerOpen(true);
              }}
            >
              <div className={styles.cardImageWrap}>
                <div className={styles.photoStack}>
                  {group.photos.slice(0, 3).map((photo, index) => (
                    <img
                      key={photo.id}
                      src={resolveGalleryImageUrl(photo.image_url)}
                      alt={group.panel_name}
                      className={styles.cardImage}
                      style={{ zIndex: 10 - index, transform: `translate(${index * 8}px, ${index * 6}px)` }}
                    />
                  ))}
                </div>
                {group.photos.length > 1 && <span className={styles.stackCount}>{group.photos.length} photos</span>}
              </div>
              <div className={styles.cardBody}>
                <h3>{group.panel_name}</h3>
              </div>
            </article>
          ))}
        </div>
      )}

      {showSubmitModal && (
        <div className={styles.modalOverlay} onClick={closeSubmitModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} type="button" onClick={closeSubmitModal}>×</button>
            <h2>Submit Gallery Photo</h2>
            <p>Your photo will be reviewed by admin before it appears in the public gallery.</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label>
                Panel Name
                <input
                  type="text"
                  value={form.panel_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, panel_name: e.target.value }))}
                  required
                />
              </label>

              <label>
                Display Name
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  disabled={form.hide_submitter_name}
                  placeholder="Name shown with photo"
                />
              </label>

              <label className={styles.inlineToggle}>
                <input
                  type="checkbox"
                  checked={Boolean(form.hide_submitter_name)}
                  onChange={(e) => setForm((prev) => ({ ...prev, hide_submitter_name: e.target.checked }))}
                />
                Hide name from photos
              </label>

              <label>
                Description (up to 200 characters)
                <textarea
                  rows={4}
                  maxLength={200}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <span className={styles.counter}>{descriptionLength}/200</span>
              </label>

              <label>
                Category
                <input
                  type="text"
                  placeholder="e.g. Floral, Geometric"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                />
              </label>

              <label>
                Link to Template (optional)
                <select
                  value={form.template_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, template_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>

              <div
                className={styles.dropZone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <p>Drag and drop a photo here</p>
                <p>or</p>
                <button
                  type="button"
                  className={styles.browseBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Computer
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFileBrowse}
                  className={styles.fileInput}
                />
                {!!photoFiles.length && (
                  <>
                    <span className={styles.fileName}>{photoFiles.length} selected</span>
                    <div className={styles.uploadPreviewGrid}>
                      {photoPreviewUrls.map((previewUrl, index) => (
                        <div key={`${previewUrl}-${index}`} className={styles.previewItem}>
                          <img src={previewUrl} alt={`Selected ${index + 1}`} className={styles.uploadPreview} />
                          <button
                            type="button"
                            className={styles.removePreviewBtn}
                            onClick={() => removeSelectedFileAt(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {submitError && <div className={styles.submitError}>{submitError}</div>}

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeSubmitModal}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewerOpen && viewerPhotos.length > 0 && (
        <div className={styles.modalOverlay} onClick={closeViewer}>
          <div className={styles.viewerModal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} type="button" onClick={closeViewer}>×</button>
            <div className={styles.viewerContent}>
              <div className={styles.viewerVisual}>
                <img
                  src={resolveGalleryImageUrl(activeViewerPhoto?.image_url)}
                  alt={activeViewerPhoto?.panel_name || 'Gallery photo'}
                  className={styles.viewerImage}
                />
                <div className={styles.viewerActions}>
                  <button
                    type="button"
                    className={styles.browseBtn}
                    onClick={() => setViewerIndex((prev) => (prev === 0 ? viewerPhotos.length - 1 : prev - 1))}
                  >
                    Prev
                  </button>
                  <span>{viewerIndex + 1} / {viewerPhotos.length}</span>
                  <button
                    type="button"
                    className={styles.browseBtn}
                    onClick={() => setViewerIndex((prev) => (prev === viewerPhotos.length - 1 ? 0 : prev + 1))}
                  >
                    Next
                  </button>
                </div>
                <div className={styles.viewerDots}>
                  {viewerPhotos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      className={`${styles.viewerDot} ${viewerIndex === index ? styles.viewerDotActive : ''}`}
                      onClick={() => setViewerIndex(index)}
                      aria-label={`View photo ${index + 1}`}
                    />
                  ))}
                </div>
              </div>

              <aside className={styles.viewerInfoBox}>
                <h3 className={styles.viewerTitle}>{viewerGroup?.panel_name || activeViewerPhoto?.panel_name || 'Panel'}</h3>
                {viewerGroup?.description && <p className={styles.viewerDescription}>{viewerGroup.description}</p>}
                {viewerHasLinkedResources && (
                  <div className={styles.resourceSwitch}>
                    {viewerDesignerHref && (
                      <a href={viewerDesignerHref} className={styles.resourceLink}>
                        View linked template{viewerLinkedResources.template_name ? `: ${viewerLinkedResources.template_name}` : ''}
                      </a>
                    )}
                    {viewerPatternHref && (
                      <a href={viewerPatternHref} className={styles.resourceLink}>
                        View related pattern{viewerLinkedResources.pattern_product_name ? `: ${viewerLinkedResources.pattern_product_name}` : ''}
                      </a>
                    )}
                    {viewerGalleryHref && (
                      <a href={viewerGalleryHref} className={styles.resourceLink}>
                        View photo gallery example{viewerLinkedResources.gallery_panel_name ? `: ${viewerLinkedResources.gallery_panel_name}` : ''}
                      </a>
                    )}
                  </div>
                )}
                <div className={styles.viewerTagRow}>
                  {viewerGroup?.category && <span className={styles.badge}>{viewerGroup.category}</span>}
                  {(viewerGroup?.template_name || viewerGroup?.template_id) && (
                    <a href={`#/gallery?template_id=${viewerGroup?.template_id}`} className={styles.templateLink}>
                      {viewerGroup?.template_name || templateNameMap.get(String(viewerGroup?.template_id)) || 'Template'}
                    </a>
                  )}
                </div>
                <p className={styles.viewerMeta}>Photo {viewerIndex + 1} of {viewerPhotos.length}</p>
                <p className={styles.viewerMeta}>Added: {formatTimestamp(activeViewerPhoto?.created_at)}</p>
                {activeViewerPhoto?.display_name && (
                  <p className={styles.viewerMeta}>By: {activeViewerPhoto.display_name}</p>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
