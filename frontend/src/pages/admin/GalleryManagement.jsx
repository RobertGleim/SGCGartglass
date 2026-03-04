import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteAdminGalleryPhoto,
  getAdminGalleryPhotos,
  getTemplates,
  submitGalleryPhoto,
  updateAdminGalleryPhoto,
} from '../../services/api';
import styles from './GalleryManagement.module.css';

const ADMIN_DEFAULT_DISPLAY_NAME = 'SGCG Art';

export default function GalleryManagement() {
  const [photos, setPhotos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [modalGroupFields, setModalGroupFields] = useState({
    panel_name: '',
    description: '',
    category: '',
    template_id: '',
    show_description: true,
    is_hidden: false,
  });
  const [modalPhotos, setModalPhotos] = useState([]);

  const [form, setForm] = useState({
    panel_name: '',
    description: '',
    category: '',
    template_id: '',
    display_name: ADMIN_DEFAULT_DISPLAY_NAME,
    hide_submitter_name: false,
  });
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState([]);
  const fileInputRef = useRef(null);
  const descriptionLength = form.description.length;

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

  const handleUploadDrop = (event) => {
    event.preventDefault();
    mergeIncomingFiles(event.dataTransfer?.files || []);
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

  const sortedGroups = useMemo(() => {
    const statusOrder = { pending: 0, approved: 1, rejected: 2 };

    const grouped = new Map();
    photos.forEach((photo) => {
      const groupId = photo.submission_group_id || String(photo.id);
      if (!grouped.has(groupId)) {
        grouped.set(groupId, {
          id: groupId,
          photos: [],
        });
      }
      grouped.get(groupId).photos.push(photo);
    });

    const materialized = Array.from(grouped.values()).map((group) => {
      const ordered = [...group.photos].sort((a, b) => {
        const at = new Date(a.created_at || 0).getTime();
        const bt = new Date(b.created_at || 0).getTime();
        return at - bt;
      });
      const hasPending = ordered.some((photo) => (photo.approval_status || 'pending') === 'pending');
      const hasApproved = ordered.some((photo) => (photo.approval_status || 'pending') === 'approved');
      const groupStatus = hasPending ? 'pending' : hasApproved ? 'approved' : 'rejected';
      const first = ordered[0] || {};
      const last = ordered[ordered.length - 1] || {};
      return {
        id: group.id,
        photos: ordered,
        panel_name: first.panel_name || '',
        description: first.raw_description ?? first.description ?? '',
        category: first.category || '',
        template_id: first.template_id ? String(first.template_id) : '',
        show_description: Boolean(first.show_description),
        is_hidden: Boolean(first.is_hidden),
        groupStatus,
        created_at: first.created_at,
        updated_at: last.updated_at || last.created_at || first.created_at,
      };
    });

    return materialized
      .filter((group) => statusFilter === 'all' || group.groupStatus === statusFilter)
      .sort((left, right) => {
        const leftRank = statusOrder[left.groupStatus] ?? 99;
        const rightRank = statusOrder[right.groupStatus] ?? 99;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
        const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
        return rightTime - leftTime;
      });
  }, [photos, statusFilter]);

  const openGroupModal = (group) => {
    setSelectedGroup(group);
    setModalGroupFields({
      panel_name: group.panel_name,
      description: group.description,
      category: group.category,
      template_id: group.template_id,
      show_description: group.show_description,
      is_hidden: group.is_hidden,
    });
    setModalPhotos(group.photos.map((photo) => ({
      id: photo.id,
      image_url: photo.image_url,
      approval_status: photo.approval_status || 'pending',
      is_cover: Boolean(photo.is_cover),
      created_at: photo.created_at,
      markDelete: false,
    })));
  };

  const closeGroupModal = () => {
    setSelectedGroup(null);
    setModalPhotos([]);
  };

  const handleModalStatusChange = (photoId, nextStatus) => {
    setModalPhotos((prev) => prev.map((photo) => (
      photo.id === photoId ? { ...photo, approval_status: nextStatus } : photo
    )));
  };

  const handleModalDeleteToggle = (photoId, markDelete) => {
    setModalPhotos((prev) => prev.map((photo) => (
      photo.id === photoId ? { ...photo, markDelete } : photo
    )));
  };

  const setModalCoverPhoto = (photoId) => {
    setModalPhotos((prev) => prev.map((photo) => ({
      ...photo,
      is_cover: photo.id === photoId,
    })));
  };

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
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)} CT`;
  };

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
      payload.append('display_name', (form.display_name || '').trim() || ADMIN_DEFAULT_DISPLAY_NAME);
      payload.append('hide_submitter_name', form.hide_submitter_name ? 'true' : 'false');
      uploadFiles.forEach((file) => {
        payload.append('photos', file);
      });
      await submitGalleryPhoto(payload);
      setForm({
        panel_name: '',
        description: '',
        category: '',
        template_id: '',
        display_name: ADMIN_DEFAULT_DISPLAY_NAME,
        hide_submitter_name: false,
      });
      setUploadFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadData();
      setStatus('Photo added successfully.');
      setShowAddModal(false);
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || 'Failed to add photo.');
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setForm({
      panel_name: '',
      description: '',
      category: '',
      template_id: '',
      display_name: ADMIN_DEFAULT_DISPLAY_NAME,
      hide_submitter_name: false,
    });
    setUploadFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

  const saveModalChanges = async () => {
    if (!selectedGroup) return;
    setIsSavingModal(true);
    setStatus('');
    try {
      const toDelete = modalPhotos.filter((photo) => photo.markDelete);
      let toKeep = modalPhotos.filter((photo) => !photo.markDelete);

      if (toDelete.length > 0) {
        const shouldContinue = window.confirm(
          `${toDelete.length} photo${toDelete.length === 1 ? '' : 's'} marked for delete will be permanently removed when saving. Continue?`
        );
        if (!shouldContinue) {
          setIsSavingModal(false);
          return;
        }
      }

      if (toKeep.length > 0 && !toKeep.some((photo) => photo.is_cover)) {
        toKeep = toKeep.map((photo, index) => ({
          ...photo,
          is_cover: index === 0,
        }));
      }

      if (!toDelete.length && !toKeep.length) {
        setStatus('No photos to update.');
        setIsSavingModal(false);
        return;
      }

      await Promise.all(toDelete.map((photo) => deleteAdminGalleryPhoto(photo.id)));

      await Promise.all(toKeep.map((photo) => updateAdminGalleryPhoto(photo.id, {
        panel_name: modalGroupFields.panel_name,
        description: modalGroupFields.description,
        category: modalGroupFields.category,
        template_id: modalGroupFields.template_id || null,
        show_description: Boolean(modalGroupFields.show_description),
        is_hidden: Boolean(modalGroupFields.is_hidden),
        approval_status: photo.approval_status || 'pending',
        is_cover: Boolean(photo.is_cover),
      })));

      await loadData();
      closeGroupModal();
      setStatus('Submission updated successfully.');
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || 'Failed to save submission changes.');
    } finally {
      setIsSavingModal(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.section}>
        <div className={styles.addPhotoLaunchRow}>
          <h3>Add Photo</h3>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => setShowAddModal(true)}
          >
            Add Photo
          </button>
        </div>
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
        ) : sortedGroups.length === 0 ? (
          <p>No gallery photos yet.</p>
        ) : (
          <div className={styles.compactList}>
            {sortedGroups.map((group) => (
              <button
                type="button"
                key={group.id}
                className={styles.compactRow}
                onClick={() => openGroupModal(group)}
              >
                <img
                  src={(group.photos.find((photo) => photo.is_cover) || group.photos[0])?.image_url}
                  alt={group.panel_name}
                  className={styles.listThumb}
                />
                <span className={styles.listPanelName}>{group.panel_name || 'Untitled'}</span>
                <span className={`${styles.statusBadge} ${styles[group.groupStatus]}`}>
                  {group.groupStatus.toUpperCase()}
                </span>
                <span className={styles.listCount}>{group.photos.length} photo{group.photos.length === 1 ? '' : 's'}</span>
                <span className={styles.listTime}>{formatTimestamp(group.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {status && <p className={styles.status}>{status}</p>}

      {showAddModal && (
        <div className={styles.modalOverlay} onClick={closeAddModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Add Photo</h3>
              <button type="button" className={styles.button} onClick={closeAddModal}>Close</button>
            </div>

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
                Display Name
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  disabled={form.hide_submitter_name}
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
                  maxLength={200}
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <span className={styles.counter}>{descriptionLength}/200</span>
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

              <div
                className={styles.dropZone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleUploadDrop}
              >
                <p>Drag and drop up to 5 photos here</p>
                <p>or</p>
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
                <span className={styles.fileName}>{uploadFiles.length ? `${uploadFiles.length} selected` : 'No file chosen'}</span>
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

              <div className={styles.actions}>
                <button type="button" className={styles.button} onClick={closeAddModal}>Cancel</button>
                <button type="submit" className={`${styles.button} ${styles.primary}`}>Add Photo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedGroup && (
        <div className={styles.modalOverlay} onClick={closeGroupModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Edit Submission</h3>
              <button type="button" className={styles.button} onClick={closeGroupModal}>Close</button>
            </div>

            <div className={styles.modalFields}>
              <label>
                Panel Name
                <input
                  type="text"
                  value={modalGroupFields.panel_name}
                  onChange={(e) => setModalGroupFields((prev) => ({ ...prev, panel_name: e.target.value }))}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={2}
                  maxLength={200}
                  value={modalGroupFields.description}
                  onChange={(e) => setModalGroupFields((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <label>
                Category
                <input
                  type="text"
                  value={modalGroupFields.category}
                  onChange={(e) => setModalGroupFields((prev) => ({ ...prev, category: e.target.value }))}
                />
              </label>
              <label>
                Linked Template
                <select
                  value={modalGroupFields.template_id}
                  onChange={(e) => setModalGroupFields((prev) => ({ ...prev, template_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <div className={styles.toggles}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(modalGroupFields.show_description)}
                    onChange={(e) => setModalGroupFields((prev) => ({ ...prev, show_description: e.target.checked }))}
                  />
                  Show Description
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(modalGroupFields.is_hidden)}
                    onChange={(e) => setModalGroupFields((prev) => ({ ...prev, is_hidden: e.target.checked }))}
                  />
                  Hidden from Public Gallery
                </label>
              </div>
            </div>

            <div className={styles.modalStackList}>
              {modalPhotos.map((photo) => (
                <div key={photo.id} className={styles.modalPhotoRow}>
                  <img src={photo.image_url} alt="Submission" className={styles.modalPhotoThumb} />
                  <div className={styles.modalPhotoMeta}>
                    <span className={styles.listTime}>Added: {formatTimestamp(photo.created_at)}</span>
                    <label>
                      Approval
                      <select
                        value={photo.approval_status}
                        onChange={(e) => handleModalStatusChange(photo.id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                    <div className={styles.photoToggleRow}>
                      <label className={styles.coverToggle}>
                        <input
                          type="radio"
                          name="cover-photo"
                          checked={Boolean(photo.is_cover)}
                          onChange={() => setModalCoverPhoto(photo.id)}
                        />
                        Cover photo (top)
                      </label>
                      <label className={styles.deleteToggle}>
                        <input
                          type="checkbox"
                          checked={Boolean(photo.markDelete)}
                          onChange={(e) => handleModalDeleteToggle(photo.id, e.target.checked)}
                        />
                        Mark for delete
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {modalPhotos.some((photo) => photo.markDelete) && (
              <p className={styles.deleteWarning}>
                Warning: One or more photos are marked for delete and will be permanently removed when you save changes.
              </p>
            )}

            <div className={styles.modalActionsRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={saveModalChanges}
                disabled={isSavingModal}
              >
                {isSavingModal ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.danger}`}
                onClick={async () => {
                  if (!selectedGroup) return;
                  const shouldDelete = window.confirm('Are you sure you want to delete this entire submission? This cannot be undone.');
                  if (!shouldDelete) return;
                  await Promise.all(selectedGroup.photos.map((photo) => removePhoto(photo.id)));
                  closeGroupModal();
                }}
              >
                Delete Entire Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
