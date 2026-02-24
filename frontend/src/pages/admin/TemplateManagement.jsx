import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import TemplateFormModal from '../../components/admin/TemplateFormModal';
import styles from './TemplateManagement.module.css';

const PAGE_SIZE = 20;
const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];

export default function TemplateManagement() {
  const [templates, setTemplates] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTemplates() {
      setLoading(true);
      try {
        const res = await api.get('/admin/templates');
        setTemplates(res.data?.items || res.data || []);
      } catch {
        window.toast && window.toast('Failed to load templates', { type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  // Search
  const filtered = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  // Pagination
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      <h1>Template Management</h1>
      <div className={styles.topBar}>
        <button className={styles.addBtn} onClick={() => { setEditTemplate(null); setShowModal(true); }}>Add New Template</button>
        <input className={styles.search} placeholder="Search by name" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={styles.bulkBtn} onClick={() => handleBulk(true)}>Activate Selected</button>
        <button className={styles.bulkBtn} onClick={() => handleBulk(false)}>Deactivate Selected</button>
      </div>
      {loading ? <div>Loading...</div> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th><input type="checkbox" onChange={e => setSelected(e.target.checked ? paged.map(t => t.id) : [])} /></th>
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
                <td><input type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))} /></td>
                <td>
                  {(t.thumbnail_url || t.image_url) ? (
                    <img src={t.thumbnail_url || t.image_url} alt={t.name} className={styles.thumb} />
                  ) : t.svg_content ? (
                    <img src={`data:image/svg+xml;base64,${btoa(t.svg_content)}`} alt={t.name} className={styles.thumb} />
                  ) : (
                    <div className={styles.thumbPlaceholder}>✦</div>
                  )}
                </td>
                <td>{t.name}</td>
                <td>{t.category}</td>
                <td>{t.difficulty}</td>
                <td>{t.dimensions}</td>
                <td>{t.piece_count ?? t.pieceCount}</td>
                <td>{(t.is_active ?? t.active) ? 'Active' : 'Inactive'}</td>
                <td>
                  <button onClick={() => { setEditTemplate(t); setShowModal(true); }}>Edit</button>
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
      <div className={styles.pagination}>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span>Page {page}</span>
        <button disabled={page * PAGE_SIZE >= filtered.length} onClick={() => setPage(page + 1)}>Next</button>
      </div>
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
              api.get('/admin/templates').then(res => setTemplates(res.data?.items || res.data || []));
            }
          }}
        />
      )}
    </div>
  );
}
