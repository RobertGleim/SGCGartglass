import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteAdminGalleryPhoto,
  getAdminGalleryPhotos,
  getTemplates,
  submitGalleryPhoto,
  updateAdminGalleryPhoto,
} from '../../services/api';
import styles from './GalleryManagement.module.css';

export default function GalleryManagement() {
  const [photos, setPhotos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
    panel_name: '',
    description: '',
    category: '',
    template_id: '',
  });
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!uploadFiles.length) {
      setUploadPreviewUrls([]);
      return;
    }
    const urls = uploadFiles.map((file) => URL.createObjectURL(file));
    setUploadPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [uploadFiles]);

  const mergeIncomingFiles = (incomingFiles) => {
    const safeFiles = Array.from(incomingFiles || []).filter(Boolean);
    if (!safeFiles.length) return;
    setUploadFiles((prev) => {
      const merged = [...prev, ...safeFiles].slice(0, 5);
      if (prev.length + safeFiles.length > 5) {
        setStatus('You can upload up to 5 photos per submission.');
      }
      return merged;
    });
  };

  const removeSelectedFileAt = (indexToRemove) => {
    setUploadFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [galleryResponse, templateResponse] = await Promise.all([
        getAdminGalleryPhotos(),
        getTemplates(),
      ]);
      const items = Array.isArray(galleryResponse?.items) ? galleryResponse.items : [];
      const templateItems = Array.isArray(templateResponse?.items) ? templateResponse.items : [];
      setPhotos(items);
      setTemplates(templateItems.map((template) => ({ id: template.id, name: template.name })));
      setStatus('');
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || 'Failed to load gallery management data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const draftsById = useMemo(() => {
    const map = new Map();
    photos.forEach((photo) => {
      map.set(photo.id, {
        panel_name: photo.panel_name || '',
        description: photo.raw_description ?? photo.description ?? '',
        category: photo.category || '',
        template_id: photo.template_id ? String(photo.template_id) : '',
        show_description: Boolean(photo.show_description),
        is_hidden: Boolean(photo.is_hidden),
        approval_status: photo.approval_status || 'pending',
      });
    });
    return map;
  }, [photos]);

  const sortedPhotos = useMemo(() => {
    const statusOrder = { pending: 0, approved: 1, rejected: 2 };
    return photos
      .filter((photo) => statusFilter === 'all' || (photo.approval_status || 'pending') === statusFilter)
      .sort((left, right) => {
      const leftRank = statusOrder[left.approval_status || 'pending'] ?? 99;
      const rightRank = statusOrder[right.approval_status || 'pending'] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    });
  }, [photos, statusFilter]);

  const handleAdminUpload = async (event) => {
    event.preventDefault();
    setStatus('');
    if (!uploadFiles.length) {
      setStatus('Choose an image before submitting.');
      return;
    }
    if (!form.panel_name.trim()) {
      setStatus('Panel name is required.');
      return;
    }

    try {
      const payload = new FormData();
      payload.append('panel_name', form.panel_name.trim());
      payload.append('description', form.description.trim());
      payload.append('category', form.category.trim());
      payload.append('template_id', form.template_id || '');
      uploadFiles.forEach((file) => {
        payload.append('photos', file);
      });
      await submitGalleryPhoto(payload);
      setForm({ panel_name: '', description: '', category: '', template_id: '' });
      setUploadFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadData();
      setStatus('Photo added successfully.');
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || 'Failed to add photo.');
    }
  };

  const updatePhotoField = (photoId, field, value) => {
    setPhotos((prev) => prev.map((photo) => {
      if (photo.id !== photoId) return photo;
      if (field === 'description') {
        return { ...photo, raw_description: value, description: photo.show_description ? value : null };
      }
      if (field === 'show_description') {
        const showDescription = Boolean(value);
        return {
          ...photo,
          show_description: showDescription,
          description: showDescription ? (photo.raw_description ?? photo.description ?? '') : null,
        };
      }
      if (field === 'template_id') {
        const templateId = value ? Number(value) : null;
        const template = templates.find((entry) => Number(entry.id) === templateId);
        return {
          ...photo,
          template_id: templateId,
          template_name: template?.name || null,
        };
      }
      if (field === 'approval_status') {
        return { ...photo, approval_status: value };
      }
      return { ...photo, [field]: value };
    }));
  };

  const savePhoto = async (photo) => {
    setSavingId(photo.id);
    setStatus('');
    try {
      await updateAdminGalleryPhoto(photo.id, {
        panel_name: photo.panel_name,
        description: photo.raw_description ?? photo.description ?? '',
        category: photo.category,
        template_id: photo.template_id || null,
        show_description: Boolean(photo.show_description),
        is_hidden: Boolean(photo.is_hidden),
        approval_status: photo.approval_status || 'pending',
      });
      setStatus(`Saved photo #${photo.id}.`);
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || `Failed to save photo #${photo.id}.`);
    } finally {
      setSavingId(null);
    }
  };

  const removePhoto = async (photoId) => {
    setStatus('');
    try {
      await deleteAdminGalleryPhoto(photoId);
      setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
      setStatus(`Deleted photo #${photoId}.`);
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || `Failed to delete photo #${photoId}.`);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.section}>
        <h3>Add Photo</h3>
        <form onSubmit={handleAdminUpload} className={styles.form}>
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
              maxLength={200}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </label>

          <label>
            Category
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="e.g. Floral, Geometric"
            />
          </label>

          <label>
            Linked Template
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

          <div className={styles.uploadRow}>
            <button type="button" className={styles.button} onClick={() => fileInputRef.current?.click()}>
              Browse Computer
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className={styles.hiddenInput}
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                mergeIncomingFiles(e.target.files || []);
                if (e.target) {
                  e.target.value = '';
                }
              }}
            />
            <span>{uploadFiles.length ? `${uploadFiles.length} selected` : 'No file chosen'}</span>
          </div>
          {!!uploadPreviewUrls.length && (
            <div className={styles.previewWrap}>
              <div className={styles.previewGrid}>
                {uploadPreviewUrls.map((previewUrl, index) => (
                  <div key={`${previewUrl}-${index}`} className={styles.previewItem}>
                    <img src={previewUrl} alt={`Selected ${index + 1}`} className={styles.previewImage} />
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => removeSelectedFileAt(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className={`${styles.button} ${styles.primary}`}>Add Photo</button>
        </form>
      </div>

      <div className={styles.section}>
        <h3>Manage Photos</h3>
        <p>Showing pending submissions first for faster approvals.</p>
        <div className={styles.quickFilters}>
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === 'pending' ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            Pending
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === 'approved' ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            Approved
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === 'rejected' ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter('rejected')}
          >
            Rejected
          </button>
        </div>
        {loading ? (
          <p>Loading photos…</p>
        ) : sortedPhotos.length === 0 ? (
          <p>No gallery photos yet.</p>
        ) : (
          <div className={styles.photoList}>
            {sortedPhotos.map((photo) => {
              const draft = draftsById.get(photo.id) || {};
              return (
                <article key={photo.id} className={styles.photoCard}>
                  <img src={photo.image_url} alt={photo.panel_name} className={styles.thumb} />

                  <div className={styles.cardFields}>
                    <div className={styles.statusRow}>
                      <span className={`${styles.statusBadge} ${styles[photo.approval_status || 'pending']}`}>
                        {(photo.approval_status || 'pending').toUpperCase()}
                      </span>
                    </div>
                    <label>
                      Panel Name
                      <input
                        type="text"
                        value={photo.panel_name}
                        onChange={(e) => updatePhotoField(photo.id, 'panel_name', e.target.value)}
                      />
                    </label>

                    <label>
                      Description
                      <textarea
                        rows={2}
                        maxLength={200}
                        value={draft.description}
                        onChange={(e) => updatePhotoField(photo.id, 'description', e.target.value)}
                      />
                    </label>

                    <label>
                      Category
                      <input
                        type="text"
                        value={photo.category || ''}
                        onChange={(e) => updatePhotoField(photo.id, 'category', e.target.value)}
                      />
                    </label>

                    <label>
                      Linked Template
                      <select
                        value={draft.template_id}
                        onChange={(e) => updatePhotoField(photo.id, 'template_id', e.target.value)}
                      >
                        <option value="">None</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Approval Status
                      <select
                        value={photo.approval_status || 'pending'}
                        onChange={(e) => updatePhotoField(photo.id, 'approval_status', e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>

                    <div className={styles.toggles}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(photo.show_description)}
                          onChange={(e) => updatePhotoField(photo.id, 'show_description', e.target.checked)}
                        />
                        Show Description
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(photo.is_hidden)}
                          onChange={(e) => updatePhotoField(photo.id, 'is_hidden', e.target.checked)}
                        />
                        Hidden from Public Gallery
                      </label>
                    </div>

                    <div className={styles.actions}>
                      {(photo.approval_status || 'pending') !== 'approved' && (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.primary}`}
                          onClick={() => {
                            updatePhotoField(photo.id, 'approval_status', 'approved');
                            savePhoto({ ...photo, approval_status: 'approved' });
                          }}
                        >
                          Approve
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${styles.button} ${styles.primary}`}
                        disabled={savingId === photo.id}
                        onClick={() => savePhoto(photo)}
                      >
                        {savingId === photo.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => removePhoto(photo.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {status && <p className={styles.status}>{status}</p>}
    </div>
  );
}
