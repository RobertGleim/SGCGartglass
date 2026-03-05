import { useState } from 'react';
import api from '../services/api';

let html2canvasLoader;

async function getHtml2Canvas() {
  if (!html2canvasLoader) {
    html2canvasLoader = import('html2canvas').then((module) => module.default || module);
  }
  return html2canvasLoader;
}

export default function useWorkOrderSubmit({ filledRegions, totalRegions, canvasRef }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function checkCompleteness() {
    return Object.keys(filledRegions).length / totalRegions >= 0.5;
  }

  async function generatePreview() {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const html2canvas = await getHtml2Canvas();
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
