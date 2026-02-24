import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import SpecificationsTable from '../../components/admin/SpecificationsTable';
import styles from './WorkOrderDetail.module.css';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

export default function WorkOrderDetail({ match }) {
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      try {
        const res = await api.get(`/api/admin/work-orders/${match.params.id}`);
        setOrder(res);
        setStatus(res.status);
        setNotes(res.internalNotes || '');
      } catch {
        window.toast && window.toast('Failed to load work order', { type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [match.params.id]);

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    await api.put(`/api/admin/work-orders/${order.id}/status`, { status: newStatus });
    window.toast && window.toast('Status updated', { type: 'success' });
  };

  const handleNotesChange = async (val) => {
    setNotes(val);
    await api.put(`/api/admin/work-orders/${order.id}/notes`, { notes: val });
    window.toast && window.toast('Notes updated', { type: 'success' });
  };

  if (loading || !order) return <div>Loading...</div>;

  return (
    <div className={styles.page}>
      <h1>Work Order #{order.id}</h1>
      <div className={styles.infoGrid}>
        <div>
          <h2>Customer</h2>
          <div>Name: {order.customerName}</div>
          <div>Email: {order.customerEmail}</div>
          <div>Phone: {order.customerPhone}</div>
          <div>Contact Preference: {order.contactPreference}</div>
        </div>
        <div>
          <h2>Project</h2>
          <div>Name: {order.projectName}</div>
          <div>Template: {order.templateName}</div>
          <div>Dimensions: {order.dimensions}</div>
          <div>Timeline: {order.timeline}</div>
          <div>Budget: {order.budget}</div>
          <div>Notes: {order.notes}</div>
        </div>
        <div>
          <h2>Design Preview</h2>
          <TransformWrapper>
            <TransformComponent>
              <img src={order.previewUrl} alt="Preview" className={styles.preview} />
            </TransformComponent>
          </TransformWrapper>
        </div>
      </div>
      <SpecificationsTable specs={order.specifications} />
      <div className={styles.statusRow}>
        <label>Status
          <select value={status} onChange={e => handleStatusChange(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="review">Under Review</option>
            <option value="quote">Quote Sent</option>
            <option value="production">In Production</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>Internal Notes
          <textarea value={notes} onChange={e => handleNotesChange(e.target.value)} />
        </label>
        <div className={styles.actions}>
          <button onClick={() => alert('Generate Quote placeholder')}>Generate Quote</button>
          <button onClick={() => alert('Send Message placeholder')}>Send Message</button>
          <button onClick={() => alert('Mark Complete placeholder')}>Mark Complete</button>
          <button onClick={() => alert('Cancel placeholder')}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
