import React, { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import {
  fetchAdminShippingOrders,
  fetchAdminOrderItems,
  updateAdminOrderShippingStatus,
  getAdminWorkOrder,
  getTemplate,
  updateAdminWorkOrderDesign,
  generateInvoice,
} from '../../services/api';
import LoadingMessage from '../../components/LoadingMessage';
import ColoredDesignPreview from './components/ColoredDesignPreview';
import styles from './WorkOrderDashboard.module.css';

const STATUS_OPTIONS = ['pending', 'review', 'revision_requested', 'revision_submitted', 'quote', 'approved', 'production', 'completed', 'cancelled'];
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

const SHIPPING_STATUS_LABELS = {
  need_to_ship: 'Need To Ship',
  shipped: 'Shipped',
  completed: 'Archived',
};

// Row highlight + dropdown colors per status
const STATUS_COLORS = {
  pending:            { bg: '#fde8e8', border: '#e53935', text: '#b71c1c' },   // red — new
  review:             { bg: '#fff3e0', border: '#fb8c00', text: '#e65100' },   // orange
  revision_requested: { bg: '#fff9c4', border: '#fdd835', text: '#f57f17' },   // yellow — waiting on customer
  revision_submitted: { bg: '#fff8e1', border: '#ffb300', text: '#ff8f00' },   // amber/gold
  quote:              { bg: '#e3f2fd', border: '#1e88e5', text: '#0d47a1' },   // blue
  approved:           { bg: '#e8f5e9', border: '#43a047', text: '#1b5e20' },   // green
  production:         { bg: '#e0f2f1', border: '#00897b', text: '#004d40' },   // teal
  completed:          { bg: '#e8f5e9', border: '#2e7d32', text: '#1b5e20' },   // dark green
  cancelled:          { bg: '#f5f5f5', border: '#9e9e9e', text: '#616161' },   // gray
};
const getStatusStyle = (statusKey) => {
  const c = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;
  return { backgroundColor: c.bg, borderLeft: `5px solid ${c.border}` };
};
const getSelectStyle = (statusKey) => {
  const c = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;
  return { backgroundColor: c.bg, borderColor: c.border, color: c.text, fontWeight: 600 };
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
  if (s === 'revision requested') return 'revision_requested';
  if (s === 'revision submitted') return 'revision_submitted';
  if (s === 'approved') return 'approved';
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

const EXPORTABLE_STATUS_KEYS = new Set(['approved', 'production', 'completed']);

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
};

const getOrderItemName = (item) => {
  const title = String(item?.title || '').trim();
  if (title) return title;
  const productType = String(item?.product_type || 'product').trim();
  return `${productType.charAt(0).toUpperCase()}${productType.slice(1)}`;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getSectionEntries = (order) => {
  const sections = order?.designData?.sections;
  if (!sections || typeof sections !== 'object') return [];
  return Object.entries(sections).sort(([, left], [, right]) => {
    const leftNum = Number(left?.sectionNum) || Number.MAX_SAFE_INTEGER;
    const rightNum = Number(right?.sectionNum) || Number.MAX_SAFE_INTEGER;
    if (leftNum !== rightNum) return leftNum - rightNum;
    return String(left?.glassType || '').localeCompare(String(right?.glassType || ''));
  });
};

const getApiOrigin = () => {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '/api').trim();
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '');
  }
  return window.location.origin;
};

const resolveMediaUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^javascript:/i.test(url)) return '';
  if (url.startsWith('/uploads/')) return `${getApiOrigin()}${url}`;
  if (url.startsWith('uploads/')) return `${getApiOrigin()}/${url}`;
  return url;
};

const buildWorkOrderPacketHtml = (order, designMarkup) => {
  const statusLabel = STATUS_LABELS[order?.status_key] || order?.status || 'Unknown';
  const sectionRows = getSectionEntries(order)
    .map(([sectionId, data], index) => {
      const swatch = escapeHtml(data?.color || '#cccccc');
      const displayNum = escapeHtml(data?.sectionNum || index + 1);
      const glassType = escapeHtml(data?.glassType || 'Not specified');
      const colorValue = escapeHtml(data?.color || 'Not specified');
      return `
        <tr>
          <td>${displayNum}</td>
          <td><span class="swatch" style="background:${swatch}"></span>${colorValue}</td>
          <td>${glassType}</td>
          <td>${escapeHtml(sectionId)}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(order?.work_order_number || `Work Order ${order?.id || ''}`)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, sans-serif;
        color: #1f2937;
        background: #f5f1e8;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        max-width: 1100px;
        margin: 0 auto;
        padding: 28px;
      }
      .card {
        background: #fffdf8;
        border: 1px solid #d9cfba;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 14px 34px rgba(64, 45, 20, 0.12);
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 20px;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #8b5e34;
        margin-bottom: 8px;
      }
      h1 {
        margin: 0;
        font-size: 32px;
        line-height: 1.1;
        color: #2c2418;
      }
      .status {
        display: inline-flex;
        align-items: center;
        padding: 8px 14px;
        border-radius: 999px;
        background: #e8f5e9;
        color: #1b5e20;
        font-weight: 700;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-bottom: 22px;
      }
      .panel {
        border: 1px solid #e4dac6;
        border-radius: 14px;
        padding: 16px;
        background: #fff;
      }
      .panel h2 {
        margin: 0 0 12px;
        font-size: 16px;
        color: #7a532c;
      }
      .meta {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 8px 12px;
        margin: 0;
      }
      .meta dt {
        font-weight: 700;
        color: #4a3b28;
      }
      .meta dd {
        margin: 0;
        color: #2f2a22;
        white-space: pre-wrap;
      }
      .design {
        margin: 22px 0;
        border: 1px solid #d7c8ab;
        border-radius: 18px;
        padding: 18px;
        background: linear-gradient(180deg, #ffffff 0%, #fbf6ec 100%);
      }
      .design h2, .sections h2 {
        margin: 0 0 12px;
        font-size: 18px;
        color: #5d4326;
      }
      .design-frame {
        border: 1px solid #e8dcc7;
        border-radius: 14px;
        padding: 16px;
        background: #fff;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 420px;
      }
      .design-frame svg, .design-frame img {
        width: 100%;
        max-height: 760px;
        object-fit: contain;
      }
      .sections {
        margin-top: 22px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        border-radius: 14px;
        overflow: hidden;
      }
      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid #ece3d3;
        text-align: left;
        vertical-align: middle;
      }
      th {
        background: #f0e6d6;
        color: #5b4428;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .swatch {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,0.2);
        margin-right: 8px;
        vertical-align: middle;
      }
      .footer {
        margin-top: 18px;
        font-size: 12px;
        color: #6b5b43;
      }
      @media print {
        body { background: #fff; }
        .sheet { max-width: none; padding: 0; }
        .card { box-shadow: none; border: none; border-radius: 0; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="card">
        <div class="header">
          <div>
            <div class="eyebrow">SGCG Art Glass Work Order</div>
            <h1>${escapeHtml(order?.work_order_number || `#${order?.id || ''}`)}</h1>
          </div>
          <div class="status">${escapeHtml(statusLabel)}</div>
        </div>

        <div class="grid">
          <section class="panel">
            <h2>Customer</h2>
            <dl class="meta">
              <dt>Name</dt><dd>${escapeHtml(order?.customer || 'Unknown customer')}</dd>
              <dt>User ID</dt><dd>${escapeHtml(order?.user_id || 'Unknown')}</dd>
              <dt>Submitted</dt><dd>${escapeHtml(formatDateTime(order?.created_at || order?.date))}</dd>
              <dt>Last Updated</dt><dd>${escapeHtml(formatDateTime(order?.updated_at || order?.date))}</dd>
            </dl>
          </section>
          <section class="panel">
            <h2>Project</h2>
            <dl class="meta">
              <dt>Project</dt><dd>${escapeHtml(order?.projectName || order?.project?.name || 'Custom Design')}</dd>
              <dt>Template</dt><dd>${escapeHtml(order?.templateName || order?.templateData?.name || 'Custom Design')}</dd>
              <dt>Quote</dt><dd>${escapeHtml(order?.quote_amount != null ? `$${Number(order.quote_amount).toFixed(2)}` : 'Not quoted')}</dd>
              <dt>Customer Notes</dt><dd>${escapeHtml(order?.customer_notes || 'None')}</dd>
              <dt>Admin Notes</dt><dd>${escapeHtml(order?.admin_notes || 'None')}</dd>
            </dl>
          </section>
        </div>

        <section class="design">
          <h2>Full-Color Design</h2>
          <div class="design-frame">${designMarkup}</div>
        </section>

        ${sectionRows ? `
        <section class="sections">
          <h2>Section Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Color</th>
                <th>Glass Type</th>
                <th>Section ID</th>
              </tr>
            </thead>
            <tbody>${sectionRows}</tbody>
          </table>
        </section>` : ''}

        <div class="footer">Generated from the admin work order dashboard for production review and printing.</div>
      </div>
    </div>
  </body>
</html>`;
};

export default function WorkOrderDashboard() {
  const [orders, setOrders] = useState([]);
  const [shippingOrders, setShippingOrders] = useState([]);
  const [shippingLoading, setShippingLoading] = useState(true);
  const [updatingShippingOrderId, setUpdatingShippingOrderId] = useState(null);
  const [shippingTab, setShippingTab] = useState('active');
  const [selectedShippingOrder, setSelectedShippingOrder] = useState(null);
  const [selectedShippingOrderItems, setSelectedShippingOrderItems] = useState([]);
  const [selectedShippingOrderLoading, setSelectedShippingOrderLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [lockingRevision, setLockingRevision] = useState(false);
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
  const [exportingPacket, setExportingPacket] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ amount: '', dueDate: '', notes: '' });
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const previewRef = useRef(null);

  const isRevisionLocked = (designData) => !!designData?.admin_revision_locked;

  const toggleRevisionLock = async (order, lock) => {
    if (!order) return;
    const orderId = order.id;
    const nextDesignData = {
      ...(order.designData || {}),
      admin_revision_locked: !!lock,
      admin_revision_locked_at: lock ? new Date().toISOString() : null,
    };
    setLockingRevision(true);
    try {
      await updateAdminWorkOrderDesign(orderId, nextDesignData);
      setSelectedOrder((prev) => prev ? { ...prev, designData: nextDesignData } : prev);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, designData: nextDesignData } : o)));
      window.toast && window.toast(lock ? 'Final revision locked' : 'Revision unlocked', { type: 'success' });
    } catch (err) {
      console.error('[WorkOrderDashboard] Failed to toggle revision lock:', err);
      window.toast && window.toast('Failed to update revision lock', { type: 'error' });
    } finally {
      setLockingRevision(false);
    }
  };

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

  const fetchShippingQueue = async () => {
    setShippingLoading(true);
    try {
      const res = await fetchAdminShippingOrders({ limit: 300 });
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setShippingOrders(items);
    } catch {
      window.toast && window.toast('Failed to load shipping queue', { type: 'error' });
      setShippingOrders([]);
    } finally {
      setShippingLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchShippingQueue();
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

  const handleShippingStatusUpdate = async (order, nextStatus) => {
    const orderId = Number(order?.id || 0);
    if (!orderId || !nextStatus) return;

    setUpdatingShippingOrderId(orderId);
    try {
      await updateAdminOrderShippingStatus(orderId, nextStatus);
      setShippingOrders((prev) => {
        const updated = prev.map((entry) => (
          Number(entry?.id) === orderId
            ? {
                ...entry,
                shipping_status: nextStatus,
                status: nextStatus === 'need_to_ship' ? 'confirmed' : nextStatus,
                updated_at: new Date().toISOString(),
              }
            : entry
        ));

        const groups = {
          need_to_ship: updated.filter((entry) => String(entry?.shipping_status) === 'need_to_ship'),
          shipped: updated.filter((entry) => String(entry?.shipping_status) === 'shipped'),
          completed: updated.filter((entry) => String(entry?.shipping_status) === 'completed'),
        };
        return [...groups.need_to_ship, ...groups.shipped, ...groups.completed];
      });
      window.toast && window.toast('Shipping status updated', { type: 'success' });
    } catch (err) {
      console.error('[WorkOrderDashboard] Shipping status update error:', err);
      window.toast && window.toast('Failed to update shipping status', { type: 'error' });
    } finally {
      setUpdatingShippingOrderId(null);
    }
  };

  const openShippingOrder = async (order) => {
    const orderId = Number(order?.id || 0);
    if (!orderId) return;

    setSelectedShippingOrder(order);
    setSelectedShippingOrderLoading(true);
    setSelectedShippingOrderItems([]);

    try {
      const res = await fetchAdminOrderItems(orderId);
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setSelectedShippingOrderItems(items);
    } catch (err) {
      console.error('[WorkOrderDashboard] Failed to load order items:', err);
      window.toast && window.toast('Failed to load order details', { type: 'error' });
      setSelectedShippingOrderItems([]);
    } finally {
      setSelectedShippingOrderLoading(false);
    }
  };

  const closeShippingOrder = () => {
    setSelectedShippingOrder(null);
    setSelectedShippingOrderItems([]);
    setSelectedShippingOrderLoading(false);
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
  const openPreview = async (order, e) => {
    if (e) e.stopPropagation();
    setSelectedOrder(order);
    setSelectedOrderLoading(true);
    try {
      const detailRes = await getAdminWorkOrder(order.id);
      const detailedOrder = detailRes?.work_order || detailRes;
      let hydrated = {
        ...order,
        ...detailedOrder,
        status_key: normalizeStatus(detailedOrder?.status || order?.status),
        date: detailedOrder?.created_at || detailedOrder?.updated_at || order?.date || null,
        customer: order?.customer || `Customer #${detailedOrder?.user_id ?? '-'}`,
        projectName: extractProjectName(detailedOrder || order),
        designData: detailedOrder?.project?.design_data || order?.designData || {},
        templateData: detailedOrder?.template || order?.templateData || {},
        templateThumbnail: detailedOrder?.template?.thumbnail_url || order?.templateThumbnail || '',
        templateName: detailedOrder?.template?.name || order?.templateName || 'Custom Design',
      };

      const templateId = hydrated?.project?.template_id || hydrated?.designData?.template_id;
      if (templateId && !hydrated?.templateData?.svg_content) {
        try {
          const tplRes = await getTemplate(templateId);
          const tpl = tplRes?.template || tplRes;
          if (tpl) {
            hydrated = {
              ...hydrated,
              templateData: tpl,
              templateName: tpl.name || hydrated.templateName,
              templateThumbnail: tpl.thumbnail_url || hydrated.templateThumbnail,
            };
          }
        } catch (err) {
          console.error('[WorkOrderDashboard] Failed to hydrate template for preview:', err);
        }
      }

      setSelectedOrder(hydrated);
      setOrders((prev) => prev.map((candidate) => (candidate.id === order.id ? { ...candidate, ...hydrated } : candidate)));
    } catch (err) {
      console.error('[WorkOrderDashboard] Failed to hydrate work order detail:', err);
      window.toast && window.toast('Loaded preview summary only', { type: 'warning' });
    } finally {
      setSelectedOrderLoading(false);
    }
  };

  // Close preview modal
  const closePreview = () => setSelectedOrder(null);

  const canExportOrderPacket = selectedOrder && EXPORTABLE_STATUS_KEYS.has(selectedOrder.status_key);

  const getPrintableDesignMarkup = () => {
    const svgEl = previewRef.current?.querySelector('svg');
    if (svgEl) {
      return svgEl.outerHTML;
    }

    const imageSrc =
      selectedOrder?.designData?.preview_url
      || selectedOrder?.designData?.dataUrl
      || selectedOrder?.templateThumbnail
      || selectedOrder?.templateData?.thumbnail_url
      || selectedOrder?.templateData?.image_url;

    if (!imageSrc) {
      return '<div style="font-weight:600;color:#7a6c58;">No full-color preview available.</div>';
    }

    return `<img src="${escapeHtml(imageSrc)}" alt="Work order design preview" />`;
  };

  const exportWorkOrderPacket = async (mode) => {
    if (!selectedOrder) return;
    setExportingPacket(true);
    try {
      const packetHtml = buildWorkOrderPacketHtml(selectedOrder, getPrintableDesignMarkup());
      const safeNumber = String(selectedOrder.work_order_number || `work-order-${selectedOrder.id}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');

      if (mode === 'download') {
        const blob = new Blob([packetHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeNumber || 'work-order'}.html`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        window.toast && window.toast('Work order packet downloaded', { type: 'success' });
        return;
      }

      const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
      if (!printWindow) {
        window.toast && window.toast('Popup blocked while opening print preview', { type: 'error' });
        return;
      }
      printWindow.document.write(packetHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    } catch (err) {
      console.error('[WorkOrderDashboard] Failed to export work order packet:', err);
      window.toast && window.toast('Failed to export work order packet', { type: 'error' });
    } finally {
      setExportingPacket(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedOrder || generatingInvoice) return;

    const amount = parseFloat(invoiceForm.amount);
    if (!amount || amount <= 0) {
      window.toast && window.toast('Invoice amount must be greater than zero', { type: 'error' });
      return;
    }

    setGeneratingInvoice(true);
    try {
      const response = await generateInvoice(selectedOrder.id, {
        amount,
        due_date: invoiceForm.dueDate || null,
        notes: invoiceForm.notes || null,
      });
      const payload = response?.data || response || {};

      if (payload.success) {
        const message = payload.message || 'Invoice generated.';
        const toastType = payload.email_sent ? 'success' : 'warning';
        window.toast && window.toast(message, { type: toastType });
        setInvoiceForm({ amount: '', dueDate: '', notes: '' });
        setShowInvoiceForm(false);
      } else {
        window.toast && window.toast(payload.error || 'Failed to generate invoice', { type: 'error' });
      }
    } catch (err) {
      console.error('[WorkOrderDashboard] Failed to generate invoice:', err);
      const errorMsg = err?.response?.data?.error || 'Failed to generate invoice';
      window.toast && window.toast(errorMsg, { type: 'error' });
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Summary counts
  const summary = {
    pending: orders.filter(o => o.status_key === 'pending').length,
    review: orders.filter(o => o.status_key === 'review').length,
    revision_submitted: orders.filter(o => o.status_key === 'revision_submitted').length,
    revision_requested: orders.filter(o => o.status_key === 'revision_requested').length,
    quote: orders.filter(o => o.status_key === 'quote').length,
    approved: orders.filter(o => o.status_key === 'approved').length,
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

      <section className={styles.shippingSection}>
        <div className={styles.shippingHeader}>
          <h2>Orders To Ship</h2>
          <button onClick={fetchShippingQueue} disabled={shippingLoading || updatingShippingOrderId !== null}>Refresh Shipping Queue</button>
        </div>
        <p className={styles.shippingNote}>
          Stripe-paid physical product orders appear here automatically. Mark as shipped, then complete to archive.
        </p>

        {/* Tab bar */}
        <div className={styles.shippingTabBar}>
          <button
            className={`${styles.shippingTabBtn} ${shippingTab === 'active' ? styles.shippingTabBtnActive : ''}`}
            onClick={() => setShippingTab('active')}
          >
            Active
            {(() => { const n = shippingOrders.filter(o => String(o?.shipping_status || 'need_to_ship') !== 'completed').length; return n > 0 ? <span className={styles.shippingTabCount}>{n}</span> : null; })()}
          </button>
          <button
            className={`${styles.shippingTabBtn} ${shippingTab === 'archived' ? styles.shippingTabBtnActive : ''}`}
            onClick={() => setShippingTab('archived')}
          >
            Archived
            {(() => { const n = shippingOrders.filter(o => String(o?.shipping_status || '') === 'completed').length; return n > 0 ? <span className={styles.shippingTabCount}>{n}</span> : null; })()}
          </button>
        </div>

        {shippingLoading ? (
          <LoadingMessage label="Loading shipping queue" />
        ) : (() => {
          const visibleOrders = shippingOrders.filter((o) =>
            shippingTab === 'archived'
              ? String(o?.shipping_status || '') === 'completed'
              : String(o?.shipping_status || 'need_to_ship') !== 'completed'
          );
          if (visibleOrders.length === 0) {
            return (
              <div className={styles.shippingEmpty}>
                {shippingTab === 'archived' ? 'No archived orders.' : 'No active orders waiting to ship.'}
              </div>
            );
          }
          return (
            <table className={styles.shippingTable}>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Placed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const orderId = Number(order?.id || 0);
                  const status = String(order?.shipping_status || 'need_to_ship');
                  const isUpdating = updatingShippingOrderId === orderId;
                  const isLoadingDetails = selectedShippingOrderLoading && Number(selectedShippingOrder?.id || 0) === orderId;
                  return (
                    <tr key={orderId || `${order?.order_number || 'order'}-${order?.created_at || 'unknown'}`}>
                      <td>{order?.order_number || orderId || '-'}</td>
                      <td>{order?.customer_name || 'Customer'}</td>
                      <td>{order?.customer_email || '-'}</td>
                      <td>{Number(order?.physical_item_count || order?.item_count || 0)}</td>
                      <td>${Number(order?.total_amount || 0).toFixed(2)}</td>
                      <td>{order?.created_at ? new Date(order.created_at).toLocaleString() : '-'}</td>
                      <td>
                        <span className={`${styles.shippingStatus} ${styles[`shippingStatus_${status}`] || ''}`}>
                          {SHIPPING_STATUS_LABELS[status] || status}
                        </span>
                      </td>
                      <td>
                        <div className={styles.shippingActions}>
                          <button
                            className={styles.shippingViewBtn}
                            onClick={() => openShippingOrder(order)}
                            disabled={isLoadingDetails}
                          >
                            {isLoadingDetails ? 'Loading...' : 'View Order'}
                          </button>
                          {shippingTab === 'active' && (
                            <>
                              <button
                                onClick={() => handleShippingStatusUpdate(order, 'shipped')}
                                disabled={isUpdating || status !== 'need_to_ship'}
                              >
                                {isUpdating && status === 'need_to_ship' ? 'Saving...' : 'Mark Shipped'}
                              </button>
                              <button
                                onClick={() => handleShippingStatusUpdate(order, 'completed')}
                                disabled={isUpdating || status !== 'shipped'}
                              >
                                {isUpdating && status === 'shipped' ? 'Saving...' : 'Complete'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
      </section>

      <div className={styles.summary}>
        <div className={styles.card} style={getStatusStyle('pending')} onClick={() => setStatusFilter('pending')}>Pending Review: {summary.pending}</div>
        <div className={styles.card} style={getStatusStyle('review')} onClick={() => setStatusFilter('review')}>Under Review: {summary.review}</div>
        <div className={styles.card} style={getStatusStyle('revision_submitted')} onClick={() => setStatusFilter('revision_submitted')}>Revisions In: {summary.revision_submitted}</div>
        <div className={styles.card} style={getStatusStyle('revision_requested')} onClick={() => setStatusFilter('revision_requested')}>Sent for Review: {summary.revision_requested}</div>
        <div className={styles.card} style={getStatusStyle('quote')} onClick={() => setStatusFilter('quote')}>Quote Sent: {summary.quote}</div>
        <div className={styles.card} style={getStatusStyle('approved')} onClick={() => setStatusFilter('approved')}>Approved: {summary.approved}</div>
        <div className={styles.card} style={getStatusStyle('production')} onClick={() => setStatusFilter('production')}>In Production: {summary.production}</div>
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
      {loading ? <LoadingMessage label="Loading" /> : (
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
              <tr key={o.id} style={getStatusStyle(o.status_key)}>
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
                    style={getSelectStyle(o.status_key)}
                  >
                    {STATUS_OPTIONS.map(opt => {
                      const c = STATUS_COLORS[opt] || {};
                      return <option key={opt} value={opt} style={{ backgroundColor: c.bg, color: c.text }}>{STATUS_LABELS[opt] || opt}</option>;
                    })}
                  </select>
                </td>
                <td>{o.date ? new Date(o.date).toLocaleString() : '-'}</td>
                <td>
                  <button onClick={(e) => openPreview(o, e)}>View</button>
                  <button
                    className={styles.designerBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.hash = `#/designer?workorder=${o.id}`;
                      window.dispatchEvent(new HashChangeEvent('hashchange'));
                    }}
                  >
                    🎨 Edit
                  </button>
                  <button className={styles.deleteBtn} onClick={(e) => handleDelete(o.id, e)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedShippingOrder && (
        <div className={styles.modalOverlay} onClick={closeShippingOrder}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={closeShippingOrder}>&times;</button>
            <h2>Order: {selectedShippingOrder.order_number || `#${selectedShippingOrder.id}`}</h2>

            <div className={styles.modalGrid}>
              <div className={styles.modalSection}>
                <h3>Customer</h3>
                <p><strong>Name:</strong> {selectedShippingOrder.customer_name || 'Customer'}</p>
                <p><strong>Email:</strong> {selectedShippingOrder.customer_email || '-'}</p>
                <p><strong>Status:</strong> {SHIPPING_STATUS_LABELS[selectedShippingOrder.shipping_status] || selectedShippingOrder.shipping_status || '-'}</p>
              </div>
              <div className={styles.modalSection}>
                <h3>Order Details</h3>
                <p><strong>Placed:</strong> {selectedShippingOrder.created_at ? new Date(selectedShippingOrder.created_at).toLocaleString() : '-'}</p>
                <p><strong>Subtotal:</strong> {formatMoney(selectedShippingOrder.subtotal_amount)}</p>
                <p><strong>Shipping:</strong> {formatMoney(selectedShippingOrder.shipping_amount)}</p>
                <p><strong>Tax:</strong> {formatMoney(selectedShippingOrder.tax_amount)}</p>
                <p><strong>Total:</strong> {formatMoney(selectedShippingOrder.total_amount)}</p>
              </div>
            </div>

            <div className={styles.modalSection}>
              <h3>Items Ordered</h3>
              {selectedShippingOrderLoading ? (
                <LoadingMessage label="Loading order items" />
              ) : selectedShippingOrderItems.length === 0 ? (
                <div className={styles.shippingEmpty}>No items found for this order.</div>
              ) : (
                <>
                  <table className={styles.shippingDetailsTable}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Type</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedShippingOrderItems.map((item) => {
                        const quantity = Math.max(1, Number(item?.quantity || 1));
                        const unitPrice = Number(item?.price || 0);
                        return (
                          <tr key={item?.id || `${item?.product_type || 'item'}-${item?.product_id || ''}-${item?.title || ''}`}>
                            <td>{getOrderItemName(item)}</td>
                            <td>{item?.product_type || '-'}</td>
                            <td>{quantity}</td>
                            <td>{formatMoney(unitPrice)}</td>
                            <td>{formatMoney(unitPrice * quantity)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {selectedShippingOrderItems.some((item) => Boolean(resolveMediaUrl(item?.image_url))) && (
                    <div className={styles.shippingThumbSection}>
                      <h4>Product Thumbnails</h4>
                      <div className={styles.shippingThumbGrid}>
                        {selectedShippingOrderItems
                          .filter((item) => Boolean(resolveMediaUrl(item?.image_url)))
                          .map((item) => (
                            <figure
                              className={styles.shippingThumbCard}
                              key={`thumb-${item?.id || `${item?.product_type || 'item'}-${item?.product_id || ''}`}`}
                            >
                              <img
                                src={resolveMediaUrl(item?.image_url)}
                                alt={getOrderItemName(item)}
                                className={styles.shippingThumbImage}
                                loading="lazy"
                              />
                              <figcaption>{getOrderItemName(item)}</figcaption>
                            </figure>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {selectedOrder && (
        <div className={styles.modalOverlay}>
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
              <div className={styles.revisionControls}>
                <span className={styles.revisionState}>
                  {isRevisionLocked(selectedOrder.designData) ? 'Final revision: Locked' : 'Final revision: Editable'}
                </span>
                <button
                  className={styles.revisionButton}
                  disabled={lockingRevision}
                  onClick={() => toggleRevisionLock(selectedOrder, !isRevisionLocked(selectedOrder.designData))}
                >
                  {lockingRevision
                    ? 'Saving...'
                    : isRevisionLocked(selectedOrder.designData)
                      ? 'Unlock Revision'
                      : 'Lock Final Revision'}
                </button>
              </div>
              {selectedOrderLoading ? (
                <LoadingMessage label="Loading work order detail" />
              ) : (
                <div ref={previewRef}>
                  <ColoredDesignPreview
                    designData={selectedOrder.designData}
                    template={selectedOrder.templateData}
                    editable={true}
                    locked={isRevisionLocked(selectedOrder.designData)}
                    showExportBar={canExportOrderPacket}
                    onDesignDataChange={async (nextDesignData) => {
                      const orderId = selectedOrder.id;
                      try {
                        await updateAdminWorkOrderDesign(orderId, nextDesignData);
                        setSelectedOrder((prev) => prev ? { ...prev, designData: nextDesignData } : prev);
                        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, designData: nextDesignData } : o)));
                        window.toast && window.toast('Design updated', { type: 'success' });
                      } catch (err) {
                        console.error('[WorkOrderDashboard] Failed to update design data:', err);
                        window.toast && window.toast('Failed to save design changes', { type: 'error' });
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <div className={styles.modalSection}>
              <h3>Export & Print</h3>
              <p className={styles.exportHint}>
                Approved work orders can be downloaded as a full-color packet or sent straight to a printer for production.
              </p>
              <div className={styles.exportActions}>
                <button
                  className={styles.exportActionBtn}
                  onClick={() => exportWorkOrderPacket('download')}
                  disabled={!canExportOrderPacket || selectedOrderLoading || exportingPacket}
                >
                  {exportingPacket ? 'Preparing...' : 'Download Work Order'}
                </button>
                <button
                  className={styles.exportActionBtn}
                  onClick={() => exportWorkOrderPacket('print')}
                  disabled={!canExportOrderPacket || selectedOrderLoading || exportingPacket}
                >
                  Print Full Color
                </button>
              </div>
              {!canExportOrderPacket && (
                <p className={styles.exportLockedMessage}>
                  Export unlocks after the customer approves the work order.
                </p>
              )}
            </div>

            <div className={styles.modalSection}>
              <h3>Generate Invoice</h3>
              <p className={styles.exportHint}>
                Create and email an invoice to the customer for approved work orders. The invoice will be added to their account.
              </p>
              {canExportOrderPacket ? (
                <>
                  {!showInvoiceForm ? (
                    <button
                      className={styles.exportActionBtn}
                      onClick={() => setShowInvoiceForm(true)}
                      disabled={generatingInvoice || selectedOrderLoading}
                      style={{ marginBottom: '0.5rem' }}
                    >
                      Create New Invoice
                    </button>
                  ) : (
                    <div className={styles.invoiceForm}>
                      <input
                        type="number"
                        placeholder="Invoice amount (required)"
                        value={invoiceForm.amount}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, amount: e.target.value }))}
                        step="0.01"
                        min="0"
                      />
                      <input
                        type="date"
                        placeholder="Due date (optional)"
                        value={invoiceForm.dueDate}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                      <textarea
                        placeholder="Notes (optional)"
                        value={invoiceForm.notes}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                        rows="3"
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button
                          className={styles.exportActionBtn}
                          onClick={handleGenerateInvoice}
                          disabled={generatingInvoice || !invoiceForm.amount}
                        >
                          {generatingInvoice ? 'Generating...' : 'Generate & Send'}
                        </button>
                        <button
                          className={styles.exportActionBtn}
                          style={{ backgroundColor: '#999' }}
                          onClick={() => {
                            setShowInvoiceForm(false);
                            setInvoiceForm({ amount: '', dueDate: '', notes: '' });
                          }}
                          disabled={generatingInvoice}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.exportLockedMessage}>
                  Invoices can only be generated for approved work orders.
                </p>
              )}
            </div>

            <div className={styles.modalSection}>
              <h3>Full Designer</h3>
              <p style={{ fontSize: '0.9rem', color: '#666', margin: '0.25rem 0 0.75rem' }}>
                Open this work order in the full designer canvas to make edits, then send back to customer for review.
              </p>
              <button
                className={styles.designerBtnLarge}
                onClick={() => {
                  window.location.hash = `#/designer?workorder=${selectedOrder.id}`;
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                }}
              >
                🎨 Edit in Designer
              </button>
            </div>

            <div className={styles.modalSection}>
              <h3>Update Status</h3>
              <select 
                value={selectedOrder.status_key} 
                onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value)}
                disabled={updating}
                className={styles.statusSelectLarge}
                style={getSelectStyle(selectedOrder.status_key)}
              >
                {STATUS_OPTIONS.map(opt => {
                  const c = STATUS_COLORS[opt] || {};
                  return <option key={opt} value={opt} style={{ backgroundColor: c.bg, color: c.text }}>{STATUS_LABELS[opt] || opt}</option>;
                })}
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
