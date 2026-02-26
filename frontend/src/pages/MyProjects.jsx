import React, { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './MyProjects.module.css';

const SORT_OPTIONS = [
  { label: 'Date Modified', value: 'date' },
  { label: 'Name', value: 'name' },
];
const FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'In Progress', value: 'inprogress' },
  { label: 'Pending', value: 'pending' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'In Process', value: 'process' },
  { label: 'Submitted', value: 'submitted' },
];

// Handle API response that may be array or {projects: [...]}
const toProjectsArray = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.projects)) return res.projects;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  return [];
};

// Normalize status strings
const normalizeStatus = (status) => {
  const s = String(status || 'inprogress').trim().toLowerCase();
  if (s === 'pending review' || s === 'pending') return 'pending';
  if (s === 'under review' || s === 'reviewed') return 'reviewed';
  if (s === 'in production' || s === 'process') return 'process';
  if (s === 'submitted') return 'submitted';
  return 'inprogress';
};

export default function MyProjects() {
  const [projects, setProjects] = useState([]);
  const [sort, setSort] = useState('date');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/projects');
      const arr = toProjectsArray(res).map(p => ({
        ...p,
        status_key: normalizeStatus(p.status),
        modified: p.updated_at || p.modified || p.created_at,
        thumbnailUrl: p.thumbnail_url || p.thumbnailUrl || p.preview_url || '',
      }));
      setProjects(arr);
    } catch (err) {
      console.error('[MyProjects] Fetch error:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Handle edit - navigate to designer with project ID
  const handleEdit = (project) => {
    window.location.hash = `#/designer?project=${project.id}`;
  };

  // Handle delete
  const handleDelete = async (project) => {
    if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    setDeleting(project.id);
    try {
      await api.delete(`/projects/${project.id}`);
      setProjects(prev => prev.filter(p => p.id !== project.id));
      window.toast && window.toast('Project deleted', { type: 'success' });
    } catch (err) {
      console.error('[MyProjects] Delete error:', err);
      window.toast && window.toast('Failed to delete project', { type: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  // Handle submit - navigate to designer then submit
  const handleSubmit = (project) => {
    window.location.hash = `#/designer?project=${project.id}&submit=true`;
  };

  // Handle duplicate
  const handleDuplicate = async (project) => {
    try {
      const res = await api.post('/projects/save', {
        template_id: project.template_id,
        name: `${project.name} (Copy)`,
        design_data: project.design_data,
      });
      const newProject = res?.project || res;
      setProjects(prev => [{ ...newProject, status_key: 'inprogress', modified: new Date().toISOString() }, ...prev]);
      window.toast && window.toast('Project duplicated', { type: 'success' });
    } catch (err) {
      console.error('[MyProjects] Duplicate error:', err);
      window.toast && window.toast('Failed to duplicate project', { type: 'error' });
    }
  };

  // Sorting
  const sortedProjects = [...projects].sort((a, b) => {
    if (sort === 'date') return new Date(b.modified || 0) - new Date(a.modified || 0);
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    return 0;
  });

  // Filtering
  const filteredProjects = sortedProjects.filter((p) => {
    if (filter === 'all') return true;
    return p.status_key === filter;
  });

  return (
    <div className={styles.page}>
      <h1>My Projects</h1>
      <div className={styles.controls}>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          {FILTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <button onClick={fetchProjects} disabled={loading}>Refresh</button>
      </div>
      {loading ? <div>Loading...</div> : error ? <div className={styles.error}>{error}</div> : (
        <div className={styles.grid}>
          {filteredProjects.length === 0 ? (
            <div className={styles.empty}>No projects found. Start designing!</div>
          ) : filteredProjects.map(project => (
            <div key={project.id} className={styles.card}>
              {project.thumbnailUrl && (
                <img src={project.thumbnailUrl} alt={project.name} className={styles.thumb} />
              )}
              <div className={styles.info}>
                <div className={styles.name}>{project.name || 'Untitled Project'}</div>
                <div className={styles.meta}>Last modified: {project.modified ? new Date(project.modified).toLocaleString() : '—'}</div>
                <div className={styles.meta}>Status: <span className={styles[`status_${project.status_key}`]}>{project.status_key}</span></div>
              </div>
              <div className={styles.actions}>
                <button onClick={() => handleEdit(project)}>Edit</button>
                <button onClick={() => handleDuplicate(project)}>Duplicate</button>
                <button onClick={() => handleDelete(project)} disabled={deleting === project.id}>
                  {deleting === project.id ? 'Deleting...' : 'Delete'}
                </button>
                <button onClick={() => handleSubmit(project)} className={styles.submitBtn}>Submit</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
