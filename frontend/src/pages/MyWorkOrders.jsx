import React, { useEffect, useState } from 'react';
import api, { approveWorkOrder } from '../services/api';
import styles from './MyWorkOrders.module.css';

const WORK_ORDERS_CACHE_KEY = 'sgcg_my_work_orders_cache_v1';
const WORK_ORDERS_CACHE_TTL_MS = 60 * 1000;

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
  if (order?.project?.name) return order.project.name;
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
  if (s === 'revision requested') return 'revision_requested';
  if (s === 'revision submitted') return 'revision_submitted';
  if (s === 'in production') return 'production';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'approved') return 'approved';
  return s;
};

const STATUS_COLORS = {
  pending:            { bg: '#fde8e8', border: '#e53935', text: '#b71c1c' },
  review:             { bg: '#fff3e0', border: '#fb8c00', text: '#e65100' },
  revision_requested: { bg: '#fff9c4', border: '#fdd835', text: '#f57f17' },
  revision_submitted: { bg: '#fff8e1', border: '#ffb300', text: '#ff8f00' },
  quote:              { bg: '#e3f2fd', border: '#1e88e5', text: '#0d47a1' },
  approved:           { bg: '#e8f5e9', border: '#43a047', text: '#1b5e20' },
  production:         { bg: '#e0f2f1', border: '#00897b', text: '#004d40' },
  completed:          { bg: '#e8f5e9', border: '#2e7d32', text: '#1b5e20' },
  cancelled:          { bg: '#f5f5f5', border: '#9e9e9e', text: '#616161' },
};

const getStatusBadgeStyle = (statusKey) => {
  const c = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;
  return {
    backgroundColor: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
  };
};

const getStatusRowStyle = (statusKey) => {
  const c = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;
  return {
    backgroundColor: '#ffffff',
    borderLeft: `5px solid ${c.border}`,
  };
};

const STATUS_LABELS = {
  pending: 'Pending Review',
  review: 'Under Review',
  revision_requested: 'Revision Requested',
  revision_submitted: 'Revision Submitted',
  quote: 'Quote Sent',
  approved: 'Approved',
  production: 'In Production',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Statuses where customer can edit/review the design
const EDITABLE_STATUSES = ['pending', 'revision_requested', 'revision_submitted', 'review'];

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

  const disableTemplateContextMenu = (e) => {
    e.preventDefault();
  };

  const disableTemplateDrag = (e) => {
    e.preventDefault();
  };

  useEffect(() => {
    const handleProtectedShortcuts = (event) => {
      const key = String(event.key || '').toLowerCase();
      const withModifier = event.ctrlKey || event.metaKey;
      const isBlockedCombo = withModifier && (key === 's' || key === 'c' || key === 'x' || key === 'p');
      const isPrintScreen = key === 'printscreen';

      if (isBlockedCombo || isPrintScreen) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleProtectedShortcuts, true);
    return () => {
      window.removeEventListener('keydown', handleProtectedShortcuts, true);
    };
  }, []);

  useEffect(() => {
    async function fetchOrders() {
      const hasCached = orders.length > 0;
      setLoading(!hasCached);
      setError(null);
      try {
        const res = await api.get('/work-orders');
        const nextOrders = toOrdersArray(res);
        setOrders(nextOrders);
        sessionStorage.setItem(WORK_ORDERS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), orders: nextOrders }));
      } catch (err) {
        console.error('[MyWorkOrders] Failed to load work orders:', err);
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setError('Failed to load work orders (authentication issue). Please sign in again.');
        } else {
          setError('Failed to load work orders');
        }
      } finally {
        setLoading(false);
      }
    }

    try {
      const cachedRaw = sessionStorage.getItem(WORK_ORDERS_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const age = Date.now() - Number(cached?.timestamp || 0);
        if (Array.isArray(cached?.orders) && age >= 0 && age <= WORK_ORDERS_CACHE_TTL_MS) {
          setOrders(cached.orders);
          setLoading(false);
        }
      }
    } catch {
      // ignore cache parse issues
    }

    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (orderId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Approve this design? This will move the order forward to production.')) return;
    try {
      const res = await approveWorkOrder(orderId);
      const updatedOrder = res?.work_order || res;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedOrder } : o));
      if (selected?.id === orderId) setSelected(prev => ({ ...prev, ...updatedOrder }));
      alert('Design approved!');
    } catch {
      alert('Failed to approve. Please try again.');
    }
  };

  const handleDelete = async (orderId, orderNumber, e) => {
    if (e) e.stopPropagation();
    const displayNumber = orderNumber || `#${orderId}`;
    if (!window.confirm(`Delete work order ${displayNumber}? This cannot be undone.`)) return;
    try {
      await api.delete(`/work-orders/${orderId}`);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selected?.id === orderId) setSelected(null);
      alert('Work order deleted.');
    } catch {
      alert('Failed to delete work order. Please try again.');
    }
  };

  const openDesigner = (orderId, e) => {
    if (e) e.stopPropagation();
    window.location.hash = `#/designer?workorder=${orderId}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const filtered = orders.filter(o => filter === 'all' || normalizeStatus(o?.status) === filter);

  return (
    <div
      className={`${styles.page} ${styles.protectedAssets}`}
      onContextMenu={disableTemplateContextMenu}
      onDragStart={disableTemplateDrag}
    >
      <h1>My Work Orders</h1>
      <select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="review">Under Review</option>
        <option value="revision_requested">Revision Requested</option>
        <option value="revision_submitted">Revision Submitted</option>
        <option value="quote">Quote Sent</option>
        <option value="approved">Approved</option>
        <option value="production">In Production</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      {loading ? <div>Loading...</div> : error ? <div>{error}</div> : (
        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No work orders found.</div>
          )}
          {filtered.map(order => {
            const statusKey = normalizeStatus(order.status);
            const canEdit = EDITABLE_STATUSES.includes(statusKey);
            const needsReview = statusKey === 'revision_requested';
            return (
              <div
                key={order.id}
                className={`${styles.item} ${needsReview ? styles.needsAttention : ''}`}
                style={getStatusRowStyle(statusKey)}
                onClick={() => setSelected(order)}
              >
                <div className={styles.fileInfo}>
                  <div className={styles.itemTop}>
                    <span className={styles.badge} style={getStatusBadgeStyle(statusKey)}>
                      {STATUS_LABELS[statusKey] || order.status}
                    </span>
                    <span className={styles.orderNum}>{order.work_order_number || `#${order.id}`}</span>
                    {order.revision_count > 0 && (
                      <span className={styles.revCount} title="Number of revisions">
                        {order.revision_count} rev{order.revision_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className={styles.itemBody}>
                    <span className={styles.name}>{getProjectName(order)}</span>
                    <span className={styles.date}>
                      {getOrderDate(order) ? new Date(getOrderDate(order)).toLocaleString() : '—'}
                    </span>
                  </div>
                  {needsReview && (
                    <div className={styles.attentionBanner}>
                      ⚠️ Admin has made changes — please review
                    </div>
                  )}
                </div>

                <div className={styles.itemActions}>
                  {canEdit && (
                    <button className={styles.editBtn} onClick={(e) => openDesigner(order.id, e)}>
                      🎨 Review & Edit
                    </button>
                  )}
                  {needsReview && (
                    <button className={styles.approveBtn} onClick={(e) => handleApprove(order.id, e)}>
                      ✅ Approve
                    </button>
                  )}
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => handleDelete(order.id, order.work_order_number, e)}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className={styles.detailModal}>
          <div className={styles.detailBox}>
            <button className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">×</button>
            <h2>{getProjectName(selected)}</h2>
            <div className={styles.detailRow}>
              <strong>Status:</strong>
              <span className={styles.badge} style={getStatusBadgeStyle(normalizeStatus(selected.status))}>
                {STATUS_LABELS[normalizeStatus(selected.status)] || selected.status}
              </span>
            </div>
            <div className={styles.detailRow}>
              <strong>Order #:</strong> {selected.work_order_number || `#${selected.id}`}
            </div>
            <div className={styles.detailRow}>
              <strong>Notes:</strong> {selected.customer_notes || selected.notes || '—'}
            </div>
            {selected.admin_notes && (
              <div className={styles.detailRow}>
                <strong>Admin Notes:</strong> {selected.admin_notes}
              </div>
            )}
            {(selected.project?.design_data?.preview_url || selected.project?.design_data?.dataUrl) && (
              <div className={styles.previewBox}>
                <img
                  src={selected.project.design_data.preview_url || selected.project.design_data.dataUrl}
                  alt="Design Preview"
                  className={styles.preview}
                />
              </div>
            )}
            <div className={styles.detailActions}>
              {EDITABLE_STATUSES.includes(normalizeStatus(selected.status)) && (
                <button className={styles.editBtn} onClick={(e) => openDesigner(selected.id, e)}>
                  🎨 Open in Designer
                </button>
              )}
              {normalizeStatus(selected.status) === 'revision_requested' && (
                <button className={styles.approveBtn} onClick={(e) => handleApprove(selected.id, e)}>
                  ✅ Approve Design
                </button>
              )}
              <button
                className={styles.deleteBtn}
                onClick={(e) => handleDelete(selected.id, selected.work_order_number, e)}
              >
                🗑 Delete Work Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
