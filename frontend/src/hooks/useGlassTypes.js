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
      setGlassTypes(res.data.filter((g) => g.active));
      if (res.data.length > 0) setCurrentGlassType(res.data[0]);
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
