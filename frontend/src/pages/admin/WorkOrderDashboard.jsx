import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import ColoredDesignPreview from '../../components/admin/ColoredDesignPreview';
import styles from './WorkOrderDashboard.module.css';

const STATUS_OPTIONS = ['pending', 'review', 'quote', 'production', 'completed', 'cancelled'];
const STATUS_LABELS = {
  pending: 'Pending Review',
  review: 'Under Review',
  quote: 'Quote Sent',
  production: 'In Production',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.work_orders)) return value.work_orders;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

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

const extractProjectName = (order) => {
  if (order?.project?.name) return order.project.name;
  if (order?.project) return order.project;
  const notes = order?.customer_notes || '';
  const projectLine = notes
    .split('\n')
    .find((line) => line.toLowerCase().startsWith('project:'));
  return projectLine ? projectLine.replace(/^project:\s*/i, '') : '-';
};

export default function WorkOrderDashboard() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/work-orders');
      const normalized = toArray(res).map((order) => ({
        ...order,
        status_key: normalizeStatus(order?.status),
        date: order?.date || order?.created_at || order?.updated_at || null,
        customer: order?.customer || `Customer #${order?.user_id ?? '-'}`,
        projectName: extractProjectName(order),
        designData: order?.project?.design_data || {},
        templateData: order?.template || {},
        templateThumbnail: order?.template?.thumbnail_url || '',
        templateName: order?.template?.name || 'Custom Design',
      }));
      setOrders(normalized);
    } catch {
      window.toast && window.toast('Failed to load work orders', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Handle status change
  const handleStatusChange = async (orderId, newStatus) => {
    setUpdating(true);
    try {
      await api.put(`/admin/work-orders/${orderId}/status`, { new_status: STATUS_LABELS[newStatus] || newStatus });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: STATUS_LABELS[newStatus], status_key: newStatus } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: STATUS_LABELS[newStatus], status_key: newStatus }));
      }
      window.toast && window.toast('Status updated', { type: 'success' });
    } catch (err) {
      console.error('[WorkOrderDashboard] Status update error:', err);
      window.toast && window.toast('Failed to update status', { type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  // Delete work order
  const handleDelete = async (orderId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this work order? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/work-orders/${orderId}`);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
      window.toast && window.toast('Work order deleted', { type: 'success' });
    } catch (err) {
      console.error('[WorkOrderDashboard] Delete error:', err);
      window.toast && window.toast('Failed to delete work order', { type: 'error' });
    }
  };

  // Open preview modal
  const openPreview = (order, e) => {
    if (e) e.stopPropagation();
    setSelectedOrder(order);
  };

  // Close preview modal
  const closePreview = () => setSelectedOrder(null);

  // Summary counts
  const summary = {
    pending: orders.filter(o => o.status_key === 'pending').length,
    review: orders.filter(o => o.status_key === 'review').length,
    quote: orders.filter(o => o.status_key === 'quote').length,
    production: orders.filter(o => o.status_key === 'production').length,
  };

  // Filtering
  let filtered = orders;
  if (statusFilter !== 'all') filtered = filtered.filter(o => o.status_key === statusFilter);
  if (dateRange.from) filtered = filtered.filter(o => new Date(o.date) >= new Date(dateRange.from));
  if (dateRange.to) filtered = filtered.filter(o => new Date(o.date) <= new Date(dateRange.to));
  if (customerSearch) filtered = filtered.filter(o => String(o?.customer || '').toLowerCase().includes(customerSearch.toLowerCase()));

  // Sorting
  filtered = filtered.sort((a, b) => {
    if (sort === 'date') return new Date(b.date) - new Date(a.date);
    if (sort === 'status') return String(a?.status || '').localeCompare(String(b?.status || ''));
    if (sort === 'customer') return String(a?.customer || '').localeCompare(String(b?.customer || ''));
    return 0;
  });

  return (
    <div className={styles.page}>
      <h1>Work Order Dashboard</h1>
      <div className={styles.summary}>
        <div className={styles.card} onClick={() => setStatusFilter('pending')}>Pending Review: {summary.pending}</div>
        <div className={styles.card} onClick={() => setStatusFilter('review')}>Under Review: {summary.review}</div>
        <div className={styles.card} onClick={() => setStatusFilter('quote')}>Quote Sent: {summary.quote}</div>
        <div className={styles.card} onClick={() => setStatusFilter('production')}>In Production: {summary.production}</div>
      </div>
      <div className={styles.filters}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{STATUS_LABELS[opt] || opt}</option>)}
        </select>
        <input type="date" value={dateRange.from} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))} />
        <input type="date" value={dateRange.to} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))} />
        <input className={styles.search} placeholder="Customer" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="date">Date</option>
          <option value="status">Status</option>
          <option value="customer">Customer</option>
        </select>
        <button onClick={fetchOrders} disabled={loading}>Refresh</button>
      </div>
      {loading ? <div>Loading...</div> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Preview</th>
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
              <tr key={o.id}>
                <td>
                  <div className={styles.thumbCell} onClick={(e) => openPreview(o, e)} title="Click to view full design">
                    {(o.designData?.preview_url || o.designData?.dataUrl) ? (
                      <img src={o.designData.preview_url || o.designData.dataUrl} alt="Design" className={styles.thumbImg} />
                    ) : o.templateThumbnail ? (
                      <img src={o.templateThumbnail} alt="Template" className={styles.thumbImg} />
                    ) : (
                      <div className={styles.thumbPlaceholder}>No Image</div>
                    )}
                  </div>
                </td>
                <td>{o.work_order_number || o.id}</td>
                <td>{o.customer || '-'}</td>
                <td>{o.projectName || '-'}</td>
                <td>
                  <select 
                    value={o.status_key} 
                    onChange={(e) => handleStatusChange(o.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={updating}
                    className={styles.statusSelect}
                  >
                    {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{STATUS_LABELS[opt] || opt}</option>)}
                  </select>
                </td>
                <td>{o.date ? new Date(o.date).toLocaleString() : '-'}</td>
                <td>
                  <button onClick={(e) => openPreview(o, e)}>View</button>
                  <button className={styles.deleteBtn} onClick={(e) => handleDelete(o.id, e)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Preview Modal */}
      {selectedOrder && (
        <div className={styles.modalOverlay} onClick={closePreview}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={closePreview}>&times;</button>
            <h2>Work Order: {selectedOrder.work_order_number || `#${selectedOrder.id}`}</h2>
            
            <div className={styles.modalGrid}>
              <div className={styles.modalSection}>
                <h3>Customer Info</h3>
                <p><strong>Customer:</strong> {selectedOrder.customer}</p>
                <p><strong>Submitted:</strong> {selectedOrder.date ? new Date(selectedOrder.date).toLocaleString() : '-'}</p>
              </div>
              
              <div className={styles.modalSection}>
                <h3>Project Details</h3>
                <p><strong>Project:</strong> {selectedOrder.projectName}</p>
                <p><strong>Template:</strong> {selectedOrder.templateName}</p>
                <p><strong>Notes:</strong> {selectedOrder.customer_notes || '—'}</p>
              </div>
            </div>

            <div className={styles.modalSection}>
              <h3>Design Preview</h3>
              <ColoredDesignPreview
                designData={selectedOrder.designData}
                template={selectedOrder.templateData}
              />
            </div>

            <div className={styles.modalSection}>
              <h3>Update Status</h3>
              <select 
                value={selectedOrder.status_key} 
                onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value)}
                disabled={updating}
                className={styles.statusSelectLarge}
              >
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{STATUS_LABELS[opt] || opt}</option>)}
              </select>
            </div>

            <div className={styles.modalSection}>
              <h3>Danger Zone</h3>
              <button
                className={styles.deleteBtnLarge}
                onClick={(e) => handleDelete(selectedOrder.id, e)}
              >
                Delete Work Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
