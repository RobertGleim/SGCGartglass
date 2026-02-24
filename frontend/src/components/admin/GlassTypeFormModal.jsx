import React, { useState, useRef } from 'react';
import api from '../../services/api';
import styles from './GlassTypeFormModal.module.css';

function validateImage(file, cb) {
  if (!file) return cb('No file');
  if (!['image/png', 'image/jpeg'].includes(file.type)) return cb('Invalid file type');
  if (file.size > 1024 * 1024) return cb('File too large');
  const img = new window.Image();
  img.onload = () => {
    if (img.width !== 256 || img.height !== 256) return cb('Image must be 256x256px');
    cb(null);
  };
  img.onerror = () => cb('Invalid image');
  img.src = URL.createObjectURL(file);
}

export default function GlassTypeFormModal({ open, onClose, glassType, onSuccess }) {
  const [form, setForm] = useState({
    name: glassType?.name || '',
    description: glassType?.description || '',
    textureFile: null,
    textureUrl: glassType?.textureUrl || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef();

  if (!open) return null;

  // Handle file upload
  const handleFile = (file) => {
    validateImage(file, (err) => {
      if (err) { setError(err); return; }
      setForm(f => ({ ...f, textureFile: file }));
      const url = URL.createObjectURL(file);
      setForm(f => ({ ...f, textureUrl: url }));
    });
  };

  // Drag-and-drop
  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('description', form.description);
      // Backend expects 'texture' field name
      if (form.textureFile) formData.append('texture', form.textureFile);
      // POST or PUT using axios api instance
      if (glassType) {
        await api.put(`/admin/glass-types/${glassType.id}`, formData);
      } else {
        await api.post('/admin/glass-types', formData);
      }
      window.toast && window.toast('Glass type saved!', { type: 'success' });
      onSuccess && onSuccess();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || 'Save failed';
      setError(detail);
      window.toast && window.toast(detail, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2>{glassType ? 'Edit Glass Type' : 'Add New Glass Type'}</h2>
        <form onSubmit={handleSubmit}>
          <label>Name*
            <input type="text" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
          </label>
          <label>Description
            <textarea value={form.description} onChange={e => handleChange('description', e.target.value)} />
          </label>
          <label>Texture Image*
            <input
              type="file"
              accept="image/png,image/jpeg"
              ref={fileInputRef}
              onChange={e => handleFile(e.target.files[0])}
              required={!glassType}
            />
            <div
              className={styles.dropZone}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              Drag & drop image here
            </div>
          </label>
          {form.textureUrl && <img src={form.textureUrl} alt="Texture preview" className={styles.texture} />}
          {error && <div className={styles.error}>{error}</div>}
          <button type="submit" className={styles.submitBtn} disabled={loading || !form.name || !form.textureFile}>
            {loading ? 'Saving...' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
