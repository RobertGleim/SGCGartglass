import { useState } from 'react';
import api from '../services/api';
import html2canvas from 'html2canvas';

export default function useWorkOrderSubmit({ filledRegions, totalRegions, canvasRef }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function checkCompleteness() {
    return Object.keys(filledRegions).length / totalRegions >= 0.5;
  }

  async function generatePreview() {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const preview = await html2canvas(canvas, { backgroundColor: '#fff' });
    return preview.toDataURL('image/png');
  }

  async function submitWorkOrder(formData) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/work-orders/submit', formData);
      setLoading(false);
      return res;
    } catch {
      setError('Submission failed');
      setLoading(false);
      return null;
    }
  }

  return {
    loading,
    error,
    checkCompleteness,
    generatePreview,
    submitWorkOrder,
  };
}
