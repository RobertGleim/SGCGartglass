import React, { useState } from 'react';
import styles from './SubmitWorkOrderModal.module.css';

const TIMELINE_OPTIONS = ['1 week', '2 weeks', '1 month', 'Flexible'];
const BUDGET_OPTIONS = ['$100-$300', '$300-$600', '$600-$1000', 'Custom'];
const CONTACT_OPTIONS = ['Email', 'Phone', 'Text'];

export default function SubmitWorkOrderModal({ open, onClose, onSubmit, previewUrl, disabled }) {
  const [form, setForm] = useState({
    projectName: '',
    notes: '',
    timeline: TIMELINE_OPTIONS[0],
    budget: BUDGET_OPTIONS[0],
    contact: CONTACT_OPTIONS[0],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const validate = () => {
    if (!form.projectName.trim()) return 'Project Name required';
    if (form.projectName.length > 40) return 'Project Name too long';
    if (form.notes.length > 300) return 'Notes too long';
    return '';
  };

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    await onSubmit(form);
    setLoading(false);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2>Submit Work Order</h2>
        <form onSubmit={handleSubmit}>
          <label>Project Name*
            <input type="text" value={form.projectName} onChange={e => handleChange('projectName', e.target.value)} maxLength={40} required />
          </label>
          <label>Project Notes
            <textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)} maxLength={300} />
          </label>
          <label>Preferred Timeline*
            <select value={form.timeline} onChange={e => handleChange('timeline', e.target.value)}>
              {TIMELINE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>Budget Range*
            <select value={form.budget} onChange={e => handleChange('budget', e.target.value)}>
              {BUDGET_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <div className={styles.contactGroup}>
            Contact Preference*
            {CONTACT_OPTIONS.map(opt => (
              <label key={opt} className={styles.radioLabel}>
                <input type="radio" name="contact" value={opt} checked={form.contact === opt} onChange={() => handleChange('contact', opt)} />
                {opt}
              </label>
            ))}
          </div>
          {previewUrl && <img src={previewUrl} alt="Design preview" className={styles.preview} />}
          {error && <div className={styles.error}>{error}</div>}
          <button type="submit" className={styles.submitBtn} disabled={!!validate() || loading || disabled}>
            {loading ? 'Submitting...' : 'Submit Work Order'}
          </button>
        </form>
      </div>
    </div>
  );
}
