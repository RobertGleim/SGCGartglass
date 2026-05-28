import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import LoadingMessage from '../../components/LoadingMessage';
import GlassTypeFormModal from './components/GlassTypeFormModal';
import Pagination from '../../components/Pagination';
import styles from './GlassTypeManagement.module.css';

const PAGE_SIZE = 10;

export default function GlassTypeManagement() {
  const [glassTypes, setGlassTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editType, setEditType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [page, setPage] = useState(1);

  const fetchGlassTypes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/glass-types');
      const items = res?.items || res || [];
      setGlassTypes(Array.isArray(items) ? items : []);
    } catch {
      window.toast && window.toast('Failed to load glass types', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlassTypes();
  }, []);

  const persistOrder = async (items) => {
    setSavingOrder(true);
    try {
      const payload = items.map((g, index) => ({ id: g.id, display_order: index }));
      const res = await api.put('/admin/glass-types/reorder', { items: payload });
      const updated = res?.items || [];
      if (Array.isArray(updated) && updated.length > 0) {
        setGlassTypes(updated);
      } else {
        setGlassTypes(items.map((g, index) => ({ ...g, display_order: index })));
      }
      window.toast && window.toast('Order updated', { type: 'success' });
    } catch {
      window.toast && window.toast('Failed to save order', { type: 'error' });
      await fetchGlassTypes();
    } finally {
      setSavingOrder(false);
    }
  };

  const moveGlassType = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= glassTypes.length) return;

    const reordered = [...glassTypes];
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    setGlassTypes(reordered);
    await persistOrder(reordered);
  };

  // Toggle active/inactive
  const toggleActive = async (id) => {
    const current = glassTypes.find(g => g.id === id);
    if (!current) return;
    await api.put(`/admin/glass-types/${id}`, { is_active: !current.is_active });
    setGlassTypes(gt => gt.map(g => g.id === id ? { ...g, is_active: !g.is_active } : g));
    window.toast && window.toast('Status updated', { type: 'success' });
  };

  const totalPages = Math.max(1, Math.ceil(glassTypes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;

  const pagedGlassTypes = useMemo(() => {
    return glassTypes.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  }, [glassTypes, pageStartIndex]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [glassTypes.length]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Glass Type Management</h1>
      <div className={styles.topBar}>
        <button className={styles.addBtn} onClick={() => { setEditType(null); setShowModal(true); }}>Add New Glass Type</button>
        <p className={styles.helpText}>Use ↑ and ↓ to set display order. Top items appear first in Designer mode.</p>
      </div>
      {loading ? <LoadingMessage label="Loading" /> : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Texture</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedGlassTypes.map((g, idx) => {
                const absoluteIndex = pageStartIndex + idx;
                return (
                  <tr key={g.id}>
                    <td>
                      <div className={styles.orderCell}>
                        <button
                          className={styles.orderBtn}
                          onClick={() => moveGlassType(absoluteIndex, 'up')}
                          disabled={absoluteIndex === 0 || savingOrder}
                          title="Move up"
                        >↑</button>
                        <button
                          className={styles.orderBtn}
                          onClick={() => moveGlassType(absoluteIndex, 'down')}
                          disabled={absoluteIndex === glassTypes.length - 1 || savingOrder}
                          title="Move down"
                        >↓</button>
                        <span className={styles.orderIndex}>{absoluteIndex + 1}</span>
                      </div>
                    </td>
                    <td><img src={g.texture_url || g.textureUrl} alt={g.name} className={styles.texture} /></td>
                    <td>{g.name}</td>
                    <td>{g.description}</td>
                    <td>
                      <label className={styles.switch}>
                        <input type="checkbox" checked={g.is_active ?? g.active} onChange={() => toggleActive(g.id)} />
                        <span className={styles.slider}></span>
                      </label>
                    </td>
                    <td className={styles.actionsCell}>
                      <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => { setEditType(g); setShowModal(true); }}>Edit</button>
                      <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={async () => {
                          try {
                            await api.delete(`/admin/glass-types/${g.id}`);
                            window.toast && window.toast('Deleted', { type: 'success' });
                            await fetchGlassTypes();
                          } catch {
                            window.toast && window.toast('Failed to delete', { type: 'error' });
                          }
                        }}
                      >Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              ariaLabel="Glass type pages"
            />
          )}
        </>
      )}
      {showModal && (
        <GlassTypeFormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          glassType={editType}
          onSuccess={async () => {
            setShowModal(false);
            await fetchGlassTypes();
          }}
        />
      )}
    </div>
  );
}
