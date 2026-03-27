import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

export default function useProjectSave({ templateId, filledRegions, initialProjectId, initialProjectName }) {
  const [projectId, setProjectId] = useState(initialProjectId || null);
  const [projectName, setProjectName] = useState(initialProjectName || 'Untitled');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);
  const lastSavedData = useRef(null);

  // Collect design data
  const collectDesignData = useCallback(() => {
    const regions = Object.entries(filledRegions).map(([regionId, data]) => ({
      regionId,
      color: data.color,
      glassType: data.glassType,
    }));
    const completionPercentage = regions.length && templateId ? Math.round((regions.length / 100) * 100) : 0;
    return {
      template_id: templateId,
      project_name: projectName,
      design_data: { regions, completionPercentage },
    };
  }, [filledRegions, templateId, projectName]);

  // Save project
  const saveProject = useCallback(async (manual = false) => {
    setIsSaving(true);
    setError(null);
    const data = collectDesignData();
    try {
      const res = await api.post('/projects/save', {
        project_id: projectId,
        ...data,
      });
      setProjectId(res.projectId);
      setLastSaved(new Date());
      lastSavedData.current = JSON.stringify(data);
      if (manual) window.toast && window.toast('Project saved!', { type: 'success' });
    } catch {
      setError('Save failed');
      window.toast && window.toast('Save failed', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [collectDesignData, projectId]);

  // Auto-save every 60s if changes detected
  useEffect(() => {
    const interval = setInterval(() => {
      const data = JSON.stringify(collectDesignData());
      if (data !== lastSavedData.current) {
        saveProject();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [collectDesignData, saveProject]);

  // Manual save (Ctrl+S)
  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [saveProject]);

  return {
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    isSaving,
    lastSaved,
    error,
    manualSave: () => saveProject(true),
    collectDesignData,
  };
}
