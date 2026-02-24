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
  { label: 'Submitted', value: 'submitted' },
];

export default function MyProjects() {
  const [projects, setProjects] = useState([]);
  const [sort, setSort] = useState('date');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      try {
        const res = await api.get('/projects');
        setProjects(res.data);
      } catch {
        setError('Failed to load projects');
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  // Sorting
  const sortedProjects = [...projects].sort((a, b) => {
    if (sort === 'date') return new Date(b.modified) - new Date(a.modified);
    if (sort === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  // Filtering
  const filteredProjects = sortedProjects.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'inprogress') return p.status === 'inprogress';
    if (filter === 'submitted') return p.status === 'submitted';
    return true;
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
      </div>
      {loading ? <div>Loading...</div> : error ? <div>{error}</div> : (
        <div className={styles.grid}>
          {filteredProjects.map(project => (
            <div key={project.id} className={styles.card}>
              <img src={project.thumbnailUrl} alt={project.name} className={styles.thumb} />
              <div className={styles.info}>
                <div className={styles.name}>{project.name}</div>
                <div className={styles.meta}>Last modified: {new Date(project.modified).toLocaleString()}</div>
                <div className={styles.meta}>Status: {project.status}</div>
              </div>
              <div className={styles.actions}>
                <button onClick={() => window.location.href = `/designer/${project.id}`}>Continue Editing</button>
                <button onClick={() => alert('Duplicate placeholder')}>Duplicate</button>
                <button onClick={() => alert('Delete placeholder')}>Delete</button>
                <button onClick={() => alert('Submit placeholder')}>Submit</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
