import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import GlassTypeFormModal from '../../components/admin/GlassTypeFormModal';
import styles from './GlassTypeManagement.module.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function GlassTypeManagement() {
  const [glassTypes, setGlassTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editType, setEditType] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGlassTypes() {
      setLoading(true);
      try {
        const res = await api.get('/admin/glass-types');
        setGlassTypes(res?.items || res || []);
      } catch {
        window.toast && window.toast('Failed to load glass types', { type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    fetchGlassTypes();
  }, []);

  // Drag-to-reorder
  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(glassTypes);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setGlassTypes(reordered);
    // Update display_order
    const order = reordered.map((g, i) => ({ id: g.id, display_order: i }));
    await api.put('/admin/glass-types/reorder', { order });
    window.toast && window.toast('Order updated', { type: 'success' });
  };

  // Toggle active/inactive
  const toggleActive = async (id) => {
    const current = glassTypes.find(g => g.id === id);
    if (!current) return;
    await api.put(`/admin/glass-types/${id}`, { is_active: !current.is_active });
    setGlassTypes(gt => gt.map(g => g.id === id ? { ...g, is_active: !g.is_active } : g));
    window.toast && window.toast('Status updated', { type: 'success' });
  };

  return (
    <div className={styles.page}>
      <h1>Glass Type Management</h1>
      <button className={styles.addBtn} onClick={() => { setEditType(null); setShowModal(true); }}>Add New Glass Type</button>
      {loading ? <div>Loading...</div> : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="glassTypes">
            {(provided) => (
              <table className={styles.table} ref={provided.innerRef} {...provided.droppableProps}>
                <thead>
                  <tr>
                    <th>Texture</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {glassTypes.map((g, idx) => (
                    <Draggable key={g.id} draggableId={g.id.toString()} index={idx}>
                      {(provided) => (
                        <tr ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                          <td><img src={g.texture_url || g.textureUrl} alt={g.name} className={styles.texture} /></td>
                          <td>{g.name}</td>
                          <td>{g.description}</td>
                          <td>
                            <label className={styles.switch}>
                              <input type="checkbox" checked={g.is_active ?? g.active} onChange={() => toggleActive(g.id)} />
                              <span className={styles.slider}></span>
                            </label>
                          </td>
                          <td>
                            <button onClick={() => { setEditType(g); setShowModal(true); }}>Edit</button>
                            <button onClick={() => api.delete(`/admin/glass-types/${g.id}`).then(() => window.toast && window.toast('Deleted', { type: 'success' }))}>Delete</button>
                          </td>
                        </tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </tbody>
              </table>
            )}
          </Droppable>
        </DragDropContext>
      )}
      {showModal && (
        <GlassTypeFormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          glassType={editType}
          onSuccess={() => { setShowModal(false); window.location.reload(); }}
        />
      )}
    </div>
  );
}
