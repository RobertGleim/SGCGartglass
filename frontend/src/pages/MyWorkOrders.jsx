import React, { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './MyWorkOrders.module.css';

const STATUS_COLORS = {
  pending: '#ffb300',
  approved: '#4caf50',
  rejected: '#e53935',
  completed: '#4169e1',
};

export default function MyWorkOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const res = await api.get('/work-orders');
        setOrders(res.data);
      } catch {
        setError('Failed to load work orders');
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const filtered = orders.filter(o => filter === 'all' || o.status === filter);

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
              <span className={styles.badge} style={{ background: STATUS_COLORS[order.status] || '#ccc' }}>{order.status}</span>
              <span className={styles.name}>{order.projectName}</span>
              <span className={styles.date}>{new Date(order.modified).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div className={styles.detailModal}>
          <div className={styles.detailBox}>
            <button className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">×</button>
            <h2>{selected.projectName}</h2>
            <div>Status: <span className={styles.badge} style={{ background: STATUS_COLORS[selected.status] || '#ccc' }}>{selected.status}</span></div>
            <div>Notes: {selected.notes}</div>
            <div>Timeline: {selected.timeline}</div>
            <div>Budget: {selected.budget}</div>
            <div>Contact: {selected.contact}</div>
            <img src={selected.previewUrl} alt="Preview" className={styles.preview} />
          </div>
        </div>
      )}
    </div>
  );
}
