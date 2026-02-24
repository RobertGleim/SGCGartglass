import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import styles from './WorkOrderDashboard.module.css';

const STATUS_OPTIONS = ['pending', 'review', 'quote', 'production', 'completed', 'cancelled'];

export default function WorkOrderDashboard() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const res = await api.get('/admin/work-orders');
        setOrders(res);
      } catch {
        window.toast && window.toast('Failed to load work orders', { type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  // Summary counts
  const summary = {
    pending: orders.filter(o => o.status === 'pending').length,
    review: orders.filter(o => o.status === 'review').length,
    quote: orders.filter(o => o.status === 'quote').length,
    production: orders.filter(o => o.status === 'production').length,
  };

  // Filtering
  let filtered = orders;
  if (statusFilter !== 'all') filtered = filtered.filter(o => o.status === statusFilter);
  if (dateRange.from) filtered = filtered.filter(o => new Date(o.date) >= new Date(dateRange.from));
  if (dateRange.to) filtered = filtered.filter(o => new Date(o.date) <= new Date(dateRange.to));
  if (customerSearch) filtered = filtered.filter(o => o.customer.toLowerCase().includes(customerSearch.toLowerCase()));

  // Sorting
  filtered = filtered.sort((a, b) => {
    if (sort === 'date') return new Date(b.date) - new Date(a.date);
    if (sort === 'status') return a.status.localeCompare(b.status);
    if (sort === 'customer') return a.customer.localeCompare(b.customer);
    return 0;
  });

  return (
    <div className={styles.page}>
      <h1>Work Order Dashboard</h1>
      <div className={styles.summary}>
        <div className={styles.card}>Pending Review: {summary.pending}</div>
        <div className={styles.card}>Under Review: {summary.review}</div>
        <div className={styles.card}>Quote Sent: {summary.quote}</div>
        <div className={styles.card}>In Production: {summary.production}</div>
      </div>
      <div className={styles.filters}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
        </select>
        <input type="date" value={dateRange.from} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))} />
        <input type="date" value={dateRange.to} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))} />
        <input className={styles.search} placeholder="Customer" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="date">Date</option>
          <option value="status">Status</option>
          <option value="customer">Customer</option>
        </select>
      </div>
      {loading ? <div>Loading...</div> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Project</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} onClick={() => { window.location.hash = `#/admin/work-orders/${o.id}`; }} style={{ cursor: 'pointer' }}>
                <td>{o.id}</td>
                <td>{o.customer}</td>
                <td>{o.project}</td>
                <td>{o.status}</td>
                <td>{new Date(o.date).toLocaleString()}</td>
                <td>
                  <button onClick={e => { e.stopPropagation(); window.location.hash = `#/admin/work-orders/${o.id}`; }}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
