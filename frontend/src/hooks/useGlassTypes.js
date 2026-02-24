import { useState, useEffect } from 'react';
import api from '../services/api';

export default function useGlassTypes() {
  const [glassTypes, setGlassTypes] = useState([]);
  const [currentGlassType, setCurrentGlassType] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchGlassTypes() {
    setLoading(true);
    try {
      const res = await api.get('/api/glass-types');
      const items = Array.isArray(res) ? res : (res?.items || []);
      setGlassTypes(items.filter((g) => g.active));
      if (items.length > 0) setCurrentGlassType(items[0]);
    } catch (err) {
      // Handle error (toast, etc.)
      setGlassTypes([]);
    } finally {
      setLoading(false);
    }
  }

  function selectGlassType(glassType) {
    setCurrentGlassType(glassType);
  }

  useEffect(() => {
    fetchGlassTypes();
  }, []);

  return {
    glassTypes,
    currentGlassType,
    loading,
    fetchGlassTypes,
    selectGlassType,
  };
}
