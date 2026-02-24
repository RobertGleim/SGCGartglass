import { useEffect, useState, useRef } from 'react';
import { getTemplates } from '../services/api';
import TemplateCard from './TemplateCard';
import TemplatePreviewModal from './TemplatePreviewModal';
import styles from './TemplateGallery.module.css';

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default function TemplateGallery() {
  const [templates, setTemplates] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [preview, setPreview] = useState(null);
  const observer = useRef();

  useEffect(() => {
    setTimeout(() => setLoading(true), 0);
    getTemplates({ category: selectedCategory !== 'All' ? selectedCategory : undefined, search, page })
      .then(res => {
        setTemplates(page === 1 ? res.templates : [...templates, ...res.templates]);
        setHasMore(res.templates.length > 0);
        setCategories(['All', ...new Set(res.templates.map(t => t.category))]);
        setError(null);
      })
      .catch(err => {
        setError(err.message || 'Failed to load templates');
      })
      .finally(() => setLoading(false));
  }, [selectedCategory, search, page]);

  useEffect(() => {
    setTimeout(() => {
      setFiltered(
        templates.filter(t =>
          (selectedCategory === 'All' || t.category === selectedCategory) &&
          (!search || t.name.toLowerCase().includes(search.toLowerCase()))
        )
      );
    }, 0);
  }, [templates, selectedCategory, search]);

  const handleSearch = debounce((val) => setSearch(val), 300);

  const lastTemplateRef = useRef();
  useEffect(() => {
    if (!hasMore || loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setPage(p => p + 1);
    });
    if (lastTemplateRef.current) observer.current.observe(lastTemplateRef.current);
  }, [hasMore, loading]);

  return (
    <div className={styles.galleryWrapper}>
      <div className={styles.controls}>
        <select
          className={styles.categoryDropdown}
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          aria-label="Filter by category"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <input
          className={styles.searchBar}
          type="text"
          placeholder="Search templates..."
          onChange={e => handleSearch(e.target.value)}
          aria-label="Search templates"
        />
      </div>
      <div className={styles.grid} role="list">
        {loading && page === 1 ? (
          <div className={styles.skeletonGrid}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>No templates found.</div>
        ) : (
          filtered.map((template, idx) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={() => setPreview(template)}
              ref={idx === filtered.length - 1 ? lastTemplateRef : null}
            />
          ))
        )}
      </div>
      {preview && (
        <TemplatePreviewModal
          template={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
