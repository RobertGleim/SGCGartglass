import './Sidebar.css'

export default function Sidebar({
  categories,
  categoryCounts,
  selectedCategory,
  setSelectedCategory,
  totalProducts,
  panelLikesCount = 0,
  averageStarReview = null,
  onOpenCustomOrder,
  onOpenContactOwner,
}) {
  const hasAverageReview = Number.isFinite(Number(averageStarReview)) && Number(averageStarReview) > 0
  const normalizedAverage = hasAverageReview ? Number(averageStarReview) : 0
  const filledStars = Math.max(0, Math.min(5, Math.round(normalizedAverage)))
  const avgReviewText = hasAverageReview
    ? `${normalizedAverage.toFixed(1)} avg star review`
    : 'No star reviews yet'

  return (
    <aside className="sidebar">
      <ul>
        {categories.map((category) => (
          <li key={category}>
            <button
              className={`sidebar-category-btn ${category === selectedCategory ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              <span className="category-name">{category}</span>
              <span className="category-count">{categoryCounts[category] || 0}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-actions">
        <button className="sidebar-action-btn primary" type="button" onClick={onOpenCustomOrder}>
          Request Custom Order
        </button>
        <button className="sidebar-action-btn" type="button" onClick={onOpenContactOwner}>
          Contact shop owner
        </button>
      </div>
      <div className="sidebar-stats">
        <span className="stat-item">{panelLikesCount} Panels liked</span>
        <span className="stat-item stat-rating">
          <span className="stat-stars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className={`stat-star ${index < filledStars ? 'filled' : 'empty'}`}>★</span>
            ))}
          </span>
          <span>{avgReviewText}</span>
        </span>
      </div>
    </aside>
  )
}
