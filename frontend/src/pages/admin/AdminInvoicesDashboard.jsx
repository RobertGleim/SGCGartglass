import { useEffect, useMemo, useState } from 'react';
import {
  createAdminInvoice,
  deleteAdminInvoice,
  fetchCustomers,
  getNextCustomWorkOrderNumber,
  getAdminInvoices,
  updateAdminInvoice,
} from '../../services/api';
import './styles/AdminInvoicesDashboard.css';

const STATUS_OPTIONS = ['open', 'paid', 'on_hold', 'overdue', 'cancelled'];
const STATUS_META = {
  open: { label: 'Open', className: 'status-open' },
  paid: { label: 'Paid', className: 'status-paid' },
  on_hold: { label: 'On Hold', className: 'status-on-hold' },
  overdue: { label: 'Overdue', className: 'status-overdue' },
  cancelled: { label: 'Cancelled', className: 'status-cancelled' },
};

const toInputDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const toDisplayDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
};

export default function AdminInvoicesDashboard() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [nextCWONumber, setNextCWONumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [modalDraft, setModalDraft] = useState(null);

  const [createForm, setCreateForm] = useState({
    customer_id: '',
    customer_email: '',
    amount: '',
    due_date: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  const customerById = useMemo(() => {
    const map = new Map();
    (Array.isArray(customers) ? customers : []).forEach((c) => map.set(Number(c.id), c));
    return map;
  }, [customers]);

  const loadData = async (nextFilter = statusFilter) => {
    setLoading(true);
    setStatus('');
    try {
      const [invoiceData, customerData, cwoData] = await Promise.all([
        getAdminInvoices(nextFilter === 'all' ? {} : { status: nextFilter }),
        fetchCustomers(),
        getNextCustomWorkOrderNumber(),
      ]);
      setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
      setCustomers(Array.isArray(customerData) ? customerData : []);
      setNextCWONumber(cwoData?.next_cwo_number || '');
    } catch (error) {
      setStatus(error?.response?.data?.error || error?.message || 'Failed to load invoices.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleCreateInvoice = async (event) => {
    event.preventDefault();
    setStatus('');

    const payload = {
      customer_id: createForm.customer_id ? Number(createForm.customer_id) : null,
      customer_email: String(createForm.customer_email || '').trim() || null,
      amount: Number(createForm.amount),
      due_date: createForm.due_date || null,
      notes: createForm.notes || null,
    };

    if ((!payload.customer_id && !payload.customer_email) || !payload.amount || payload.amount <= 0) {
      setStatus('Choose a customer or enter customer email, and provide a positive amount.');
      return;
    }

    setCreating(true);
    try {
      const result = await createAdminInvoice(payload);
      const invoice = result?.invoice || null;
      if (invoice) {
        setInvoices((prev) => [invoice, ...prev]);
      }
      setCreateForm({ customer_id: '', customer_email: '', amount: '', due_date: '', notes: '' });
      setStatus('Custom invoice created.');
      
      // Fetch the next CWO number for the next invoice
      try {
        const cwoData = await getNextCustomWorkOrderNumber();
        const nextNumber = cwoData?.next_cwo_number || cwoData || '';
        if (nextNumber) {
          setNextCWONumber(nextNumber);
        }
      } catch (error) {
        console.error('Failed to fetch next CWO number:', error);
      }
    } catch (error) {
      setStatus(error?.response?.data?.error || error?.message || 'Failed to create custom invoice.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId, invoiceNumber = '') => {
    setStatus('');
    const label = invoiceNumber || `#${invoiceId}`;
    const confirmed = window.confirm(`Delete invoice ${label}? This action cannot be undone.`);
    if (!confirmed) {
      return false;
    }

    try {
      await deleteAdminInvoice(invoiceId);
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
      setStatus(`Invoice ${invoiceId} deleted.`);
      return true;
    } catch (error) {
      setStatus(error?.response?.data?.error || error?.message || 'Failed to delete invoice.');
      return false;
    }
  };

  const openInvoiceDetails = (invoice) => {
    setSelectedInvoice(invoice);
    setModalDraft({
      status: invoice.status || 'open',
      amount: invoice.amount ?? '',
      due_date: toInputDate(invoice.due_date),
      notes: invoice.notes || '',
    });
  };

  const closeInvoiceDetails = () => {
    setSelectedInvoice(null);
    setModalDraft(null);
  };

  const handleSaveModalInvoice = async () => {
    if (!selectedInvoice || !modalDraft) return;
    const invoiceId = selectedInvoice.id;
    const previousInvoice = selectedInvoice;
    const patch = {
      status: modalDraft.status,
      amount: Number(modalDraft.amount),
      due_date: modalDraft.due_date || null,
      notes: modalDraft.notes || null,
    };

    // Optimistic update: close immediately and save in background.
    setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, ...patch } : inv)));
    closeInvoiceDetails();
    setStatus(`Saving invoice ${invoiceId}...`);

    updateAdminInvoice(invoiceId, patch)
      .then((result) => {
        const updated = result?.invoice;
        if (updated) {
          setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, ...updated } : inv)));
        }
        setStatus(`Invoice ${invoiceId} updated.`);
      })
      .catch((error) => {
        // Roll back optimistic change if save fails.
        setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, ...previousInvoice } : inv)));
        setStatus(error?.response?.data?.error || error?.message || 'Failed to update invoice.');
      });
  };

  return (
    <div className="tab-panel invoices-panel-root">
      <div className="panel-section invoices-panel-head">
        <h3>Invoice Management</h3>
        <p className="form-note">
          View and maintain all invoices in one place. Custom invoices use <strong>CINV-</strong> numbers,
          work-order generated invoices keep their regular sequence.
        </p>
      </div>

      <div className="panel-section invoices-create-card">
        <h3>Create Custom Invoice</h3>
        <form onSubmit={handleCreateInvoice} className="invoices-create-form">
          <div className="invoices-create-grid">
            <label>
              Customer
              <select
                value={createForm.customer_id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_id: e.target.value, customer_email: '' }))}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{(c.first_name || '').trim()} {(c.last_name || '').trim()} ({c.email})</option>
                ))}
              </select>
            </label>
            <label>
              Customer Email (optional)
              <input
                type="email"
                value={createForm.customer_email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_email: e.target.value, customer_id: '' }))}
                placeholder="customer@email.com"
              />
            </label>
            <label>
              Work Order #
              <div style={{ padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f5f5f5', fontFamily: 'monospace', fontWeight: '600', color: '#333' }}>
                {nextCWONumber || 'Loading...'}
              </div>
            </label>
            <label>
              Amount
              <input
                type="number"
                step="0.01"
                min="0"
                value={createForm.amount}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, amount: e.target.value }))}
                required
              />
            </label>
            <label>
              Due Date
              <input
                type="date"
                value={createForm.due_date}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, due_date: e.target.value }))}
              />
            </label>
          </div>
          <label>
            Notes
            <textarea
              value={createForm.notes}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Optional notes"
            />
          </label>
          <div>
            <button type="submit" className="button primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Custom Invoice'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel-section">
        <div className="invoices-toolbar">
          <h3>All Invoices</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="button" onClick={() => loadData(statusFilter)}>Refresh</button>
        </div>

        {status && <p className="form-note invoices-status">{status}</p>}

        {loading ? (
          <p className="form-note">Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <p className="form-note">No invoices found for the selected filter.</p>
        ) : (
          <table className="admin-table invoices-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const customer = customerById.get(Number(inv.customer_id));
                const customerLabel = customer
                  ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email
                  : `${inv.first_name || ''} ${inv.last_name || ''}`.trim() || inv.email || `Customer #${inv.customer_id}`;

                return (
                  <tr key={inv.id}>
                    <td className="invoices-main-cell"><strong>{inv.invoice_number}</strong></td>
                    <td className="invoices-main-cell">{customerLabel}</td>
                    <td className="invoices-main-cell">${Number(inv.amount || 0).toFixed(2)}</td>
                    <td>
                      <span className={`invoice-status-badge ${STATUS_META[inv.status || 'open']?.className || 'status-open'}`}>
                        {STATUS_META[inv.status || 'open']?.label || inv.status || 'Open'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button"
                        onClick={() => openInvoiceDetails(inv)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedInvoice && modalDraft && (
        <div className="invoice-modal-backdrop" onClick={closeInvoiceDetails}>
          <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="invoice-modal-header">
              <h3>Invoice Details</h3>
              <button type="button" className="button" onClick={closeInvoiceDetails}>Close</button>
            </div>

            <div className="invoice-modal-grid">
              <div><strong>Invoice #:</strong> {selectedInvoice.invoice_number}</div>
              <div><strong>Customer:</strong> {customerById.get(Number(selectedInvoice.customer_id))?.email || selectedInvoice.email || `Customer #${selectedInvoice.customer_id}`}</div>
              <div><strong>Work Order:</strong> {selectedInvoice.work_order_number || (selectedInvoice.work_order_id ? `#${selectedInvoice.work_order_id}` : '-')}</div>
              <div><strong>Created:</strong> {toDisplayDate(selectedInvoice.created_at)}</div>
            </div>

            <div className="invoice-modal-form">
              <label>
                Amount
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={modalDraft.amount}
                  onChange={(e) => setModalDraft((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </label>

              <label>
                Status
                <select
                  value={modalDraft.status}
                  onChange={(e) => setModalDraft((prev) => ({ ...prev, status: e.target.value }))}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <label>
                Due Date
                <input
                  type="date"
                  value={modalDraft.due_date}
                  onChange={(e) => setModalDraft((prev) => ({ ...prev, due_date: e.target.value }))}
                />
              </label>

              <label>
                Notes
                <textarea
                  rows={4}
                  value={modalDraft.notes}
                  onChange={(e) => setModalDraft((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </label>
            </div>

            <div className="invoice-modal-actions">
              <div className="invoice-modal-actions-left">
                <button type="button" className="button" onClick={() => setModalDraft((prev) => ({ ...prev, status: 'paid' }))}>Paid</button>
                <button type="button" className="button" onClick={() => setModalDraft((prev) => ({ ...prev, status: 'on_hold' }))}>Put on hold</button>
                <button type="button" className="button" onClick={() => setModalDraft((prev) => ({ ...prev, status: 'cancelled' }))}>Cancel</button>
                <button
                  type="button"
                  className="button"
                  onClick={async () => {
                    const deleted = await handleDeleteInvoice(selectedInvoice.id, selectedInvoice.invoice_number);
                    if (deleted) {
                      closeInvoiceDetails();
                    }
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="invoice-modal-actions-right">
                <button type="button" className="button" onClick={handleSaveModalInvoice}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
