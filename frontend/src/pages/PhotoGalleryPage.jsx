import { useEffect, useMemo, useRef, useState } from 'react';
import useAuth from '../hooks/useAuth';
import useCustomerAuth from '../hooks/useCustomerAuth';
import { getGalleryPhotos, getTemplates, submitGalleryPhoto } from '../services/api';
import styles from './PhotoGalleryPage.module.css';

const getInitialTemplateIdFromHash = () => {
  const raw = window.location.hash || '';
  const idx = raw.indexOf('?');
  if (idx === -1) return '';
  const params = new URLSearchParams(raw.slice(idx + 1));
  return params.get('template_id') || params.get('template') || '';
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
  });
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const fileInputRef = useRef(null);

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
      });
      const items = Array.isArray(response?.items) ? response.items : [];
      setPhotos(items);
      setCategories(Array.isArray(response?.categories) ? response.categories : []);
      if (Array.isArray(response?.templates) && response.templates.length > 0) {
        setTemplates(response.templates);
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
    loadPhotos();
  }, [selectedCategory, selectedTemplateId]);

  const descriptionLength = form.description.length;

  const templateNameMap = useMemo(() => {
    const byId = new Map();
    templates.forEach((template) => byId.set(String(template.id), template.name));
    return byId;
  }, [templates]);

  const resetSubmitState = () => {
    setForm({ panel_name: '', description: '', category: '', template_id: '' });
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
    return Array.from(groups.values());
  }, [photos]);

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
              setForm((prev) => ({ ...prev, template_id: selectedTemplateId || prev.template_id }));
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

        <div className={styles.filterGroup}>
          <label htmlFor="gallery-template">Template</label>
          <select
            id="gallery-template"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            <option value="">All Templates</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={styles.resetBtn}
          onClick={() => {
            setSelectedCategory('');
            setSelectedTemplateId('');
          }}
        >
          Reset Filters
        </button>
      </div>

      {loading ? (
        <div className={styles.emptyState}>Loading gallery…</div>
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
                setViewerOpen(true);
              }}
            >
              <div className={styles.cardImageWrap}>
                <div className={styles.photoStack}>
                  {group.photos.slice(0, 3).map((photo, index) => (
                    <img
                      key={photo.id}
                      src={photo.image_url}
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
                {group.description && <p>{group.description}</p>}
                <div className={styles.cardMetaRow}>
                  {group.category && <span className={styles.badge}>{group.category}</span>}
                  {(group.template_name || group.template_id) && (
                    <a href={`#/gallery?template_id=${group.template_id}`} className={styles.templateLink} onClick={(e) => e.stopPropagation()}>
                      {group.template_name || templateNameMap.get(String(group.template_id)) || 'Template'}
                    </a>
                  )}
                </div>
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
        <div className={styles.modalOverlay} onClick={() => setViewerOpen(false)}>
          <div className={styles.viewerModal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} type="button" onClick={() => setViewerOpen(false)}>×</button>
            <img
              src={viewerPhotos[viewerIndex]?.image_url}
              alt={viewerPhotos[viewerIndex]?.panel_name || 'Gallery photo'}
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
        </div>
      )}
    </div>
  );
}
