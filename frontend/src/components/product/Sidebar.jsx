import '../../styles/Sidebar.css'

export default function Sidebar({ categories, categoryCounts, selectedCategory, setSelectedCategory, totalProducts }) {
  return (
    <aside className="sidebar">
      <ul>
        {categories.map((category) => (
          <li key={category}>
            <button
              className={category === selectedCategory ? 'active' : ''}
              onClick={() => setSelectedCategory(category)}
            >
              <span className="category-name">{category}</span>
              <span className="category-count">{categoryCounts[category] || 0}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-actions">
        <button className="sidebar-action-btn primary">
          Request Custom Order
        </button>
        <button className="sidebar-action-btn">
          Contact shop owner
        </button>
      </div>
      <div className="sidebar-stats">
        <a href="#" className="stat-link">{totalProducts} Sales</a>
        <a href="#" className="stat-link">442 Admirers</a>
      </div>
    </aside>
  )
}
