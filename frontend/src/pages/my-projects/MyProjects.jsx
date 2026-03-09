import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import LoadingMessage from '../../components/LoadingMessage';
import styles from './MyProjects.module.css';

const PROJECTS_CACHE_KEY = 'sgcg_my_projects_cache_v1';
const PROJECTS_CACHE_TTL_MS = 60 * 1000;

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

const STATUS_LABELS = {
  inprogress: 'In Progress',
  pending: 'Pending',
  reviewed: 'Under Review',
  process: 'In Process',
  submitted: 'Submitted',
};

const STATUS_COLORS = {
  inprogress: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
  pending: { bg: '#fde8e8', border: '#e53935', text: '#b71c1c' },
  reviewed: { bg: '#fff3e0', border: '#fb8c00', text: '#e65100' },
  process: { bg: '#e0f2f1', border: '#00897b', text: '#004d40' },
  submitted: { bg: '#e3f2fd', border: '#1e88e5', text: '#0d47a1' },
};

const getStatusStyle = (statusKey) => {
  const c = STATUS_COLORS[statusKey] || STATUS_COLORS.inprogress;
  return {
    backgroundColor: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
  };
};

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

  const fetchProjects = async () => {
    const hasCached = projects.length > 0;
    setLoading(!hasCached);
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
      sessionStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), projects: arr }));
    } catch (err) {
      console.error('[MyProjects] Fetch error:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const cachedRaw = sessionStorage.getItem(PROJECTS_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const age = Date.now() - Number(cached?.timestamp || 0);
        if (Array.isArray(cached?.projects) && age >= 0 && age <= PROJECTS_CACHE_TTL_MS) {
          setProjects(cached.projects);
          setLoading(false);
        }
      }
    } catch {
      // ignore cache parse issues
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (project.work_order_id) {
      // Already has a work order — open directly in revision mode
      window.location.hash = `#/designer?workorder=${project.work_order_id}`;
    } else {
      window.location.hash = `#/designer?project=${project.id}&submit=true`;
    }
  };

  // Handle duplicate
  const handleDuplicate = async (project) => {
    try {
      const projectDetails = await api.get(`/projects/${project.id}`);
      const sourceProject = projectDetails?.project || project;
      const res = await api.post('/projects/save', {
        template_id: sourceProject.template_id,
        project_name: `${project.name} (Copy)`,
        design_data: sourceProject.design_data,
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
    <div
      className={`${styles.page} ${styles.protectedAssets}`}
      onContextMenu={disableTemplateContextMenu}
      onDragStart={disableTemplateDrag}
    >
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
      {loading ? <LoadingMessage label="Loading" /> : error ? <div className={styles.error}>{error}</div> : (
        <div className={styles.list}>
          {filteredProjects.length === 0 ? (
            <div className={styles.empty}>No projects found. Start designing!</div>
          ) : filteredProjects.map(project => (
            <div key={project.id} className={styles.item}>
              {project.thumbnailUrl ? (
                <img src={project.thumbnailUrl} alt={project.name} className={styles.thumb} />
              ) : (
                <div className={styles.thumbPlaceholder}>No Preview</div>
              )}

              <div className={styles.fileInfo}>
                <div className={styles.itemTop}>
                  <span className={styles.name}>{project.name || 'Untitled Project'}</span>
                  <span className={styles.statusBadge} style={getStatusStyle(project.status_key)}>
                    {STATUS_LABELS[project.status_key] || project.status_key}
                  </span>
                </div>
                <div className={styles.meta}>Last modified: {project.modified ? new Date(project.modified).toLocaleString() : '—'}</div>
              </div>

              <div className={styles.actions}>
                <button onClick={() => handleEdit(project)}>Edit</button>
                <button onClick={() => handleDuplicate(project)}>Duplicate</button>
                <button onClick={() => handleDelete(project)} disabled={deleting === project.id}>
                  {deleting === project.id ? 'Deleting...' : 'Delete'}
                </button>
                <button onClick={() => handleSubmit(project)} className={styles.submitBtn}>
                  {project.work_order_id ? 'View Work Order' : 'Submit'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
