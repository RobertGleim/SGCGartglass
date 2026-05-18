import './Sidebar.css'

export default function Sidebar({
  categories,
  categoryCounts,
  selectedCategory,
  setSelectedCategory,
  styleOptions = [],
  shapeOptions = [],
  colorOptions = [],
  selectedStyleFilters = [],
  selectedShapeFilters = [],
  selectedColorFilters = [],
  styleCounts = {},
  shapeCounts = {},
  colorCounts = {},
  onToggleStyle,
  onToggleShape,
  onToggleColor,
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

  const topCategories = Array.from(
    new Set(
      (Array.isArray(categories) ? categories : [])
        .filter((entry) => {
          const normalized = String(entry || '').trim().toLowerCase()
          return normalized === 'all' || normalized === 'on sale' || normalized === 'featured'
        })
    )
  )

  if (!topCategories.some((entry) => String(entry || '').trim().toLowerCase() === 'all')) {
    topCategories.unshift('All')
  }

  if (!topCategories.some((entry) => String(entry || '').trim().toLowerCase() === 'on sale')) {
    topCategories.push('On sale')
  }

  if (!topCategories.some((entry) => String(entry || '').trim().toLowerCase() === 'featured')) {
    topCategories.push('Featured')
  }

  const isSelectedFilter = (selectedValues, value) => {
    const target = String(value || '').trim().toLowerCase()
    if (!target) return false
    return selectedValues.some((entry) => String(entry || '').trim().toLowerCase() === target)
  }

  const renderFilterSection = (title, options, selectedValues, counts, onToggle) => {
    if (!Array.isArray(options) || options.length === 0 || typeof onToggle !== 'function') {
      return null
    }

    return (
      <div className="sidebar-filter-section" aria-label={`${title} filters`}>
        <p className="sidebar-filter-title">{title}</p>
        <ul className="sidebar-filter-list">
          {options.map((option) => {
            const checked = isSelectedFilter(selectedValues, option)
            return (
              <li key={option}>
                <label className="sidebar-filter-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(option)}
                  />
                  <span className="sidebar-filter-label">{option}</span>
                  <span className="sidebar-filter-count">{counts?.[option] || 0}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <ul>
        {topCategories.map((category) => (
          <li key={category}>
            <button
              type="button"
              className={`sidebar-category-btn ${category === selectedCategory ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              <span className="category-name">{category}</span>
              <span className="category-count">{categoryCounts[category] || 0}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-filter-groups">
        {renderFilterSection('Style', styleOptions, selectedStyleFilters, styleCounts, onToggleStyle)}
        {renderFilterSection('Shape', shapeOptions, selectedShapeFilters, shapeCounts, onToggleShape)}
        {renderFilterSection('Color', colorOptions, selectedColorFilters, colorCounts, onToggleColor)}
      </div>
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
