import React, { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './MyWorkOrders.module.css';

const toOrdersArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.work_orders)) return payload.work_orders;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const getProjectName = (order) => {
  if (order?.projectName) return order.projectName;
  if (order?.project_name) return order.project_name;
  const notes = order?.customer_notes || '';
  const projectLine = notes
    .split('\n')
    .find((line) => line.toLowerCase().startsWith('project:'));
  return projectLine ? projectLine.replace(/^project:\s*/i, '') : 'Untitled Project';
};

const getOrderDate = (order) => order?.updated_at || order?.created_at || order?.modified;

const normalizeStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'pending review') return 'pending';
  if (s === 'under review') return 'review';
  if (s === 'quote sent') return 'quote';
  if (s === 'in production') return 'production';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return s;
};

const STATUS_COLORS = {
  pending: '#ffb300',
  approved: '#4caf50',
  rejected: '#e53935',
  completed: '#4169e1',
};

export default function MyWorkOrders() {
  const initialStatus = (() => {
    const query = window.location.hash.split('?')[1] || '';
    const params = new URLSearchParams(query);
    const status = params.get('status');
    return status || 'all';
  })();

  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState(initialStatus);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const res = await api.get('/work-orders');
        setOrders(toOrdersArray(res));
      } catch {
        setError('Failed to load work orders');
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const filtered = orders.filter(o => filter === 'all' || normalizeStatus(o?.status) === filter);

  return (
    <div className={styles.page}>
      <h1>My Work Orders</h1>
      <select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="completed">Completed</option>
      </select>
      {loading ? <div>Loading...</div> : error ? <div>{error}</div> : (
        <div className={styles.list}>
          {filtered.map(order => (
            <div key={order.id} className={styles.item} onClick={() => setSelected(order)}>
              <span className={styles.badge} style={{ background: STATUS_COLORS[normalizeStatus(order.status)] || '#ccc' }}>{order.status}</span>
              <span className={styles.name}>{getProjectName(order)}</span>
              <span className={styles.date}>{getOrderDate(order) ? new Date(getOrderDate(order)).toLocaleString() : '—'}</span>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div className={styles.detailModal}>
          <div className={styles.detailBox}>
            <button className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">×</button>
            <h2>{getProjectName(selected)}</h2>
            <div>Status: <span className={styles.badge} style={{ background: STATUS_COLORS[normalizeStatus(selected.status)] || '#ccc' }}>{selected.status}</span></div>
            <div>Notes: {selected.customer_notes || selected.notes || '—'}</div>
            <div>Timeline: {selected.timeline}</div>
            <div>Budget: {selected.budget}</div>
            <div>Contact: {selected.contact}</div>
            {selected.previewUrl && <img src={selected.previewUrl} alt="Preview" className={styles.preview} />}
          </div>
        </div>
      )}
    </div>
  );
}
