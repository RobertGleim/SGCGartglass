import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../../components/product/Sidebar';
import ProductCard from '../../components/product/ProductCard';
import SearchBar from '../../components/common/SearchBar';
import '../../styles/ProductPage.css';
import useAuth from '../../hooks/useAuth';
import { fetchRecentReviews } from '../../services/api';

const normalizeText = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '')).join(' ').toLowerCase()
  }
  return String(value || '').toLowerCase()
}

const normalizeCategoryValue = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const PRODUCT_TABS = [
  { key: 'stained-glass-panels', label: 'Stained Glass Panels' },
  { key: 'fused-art', label: 'Fused Art' },
  { key: 'laser-and-sandblasting', label: 'Laser and Sandblasting' },
  { key: 'wood-art', label: 'Wood Art' },
  { key: 'patterns', label: 'Patterns' },
]

const CATEGORY_TYPE_ALIASES = {
  stainedglasspanels: 'stained-glass-panels',
  stainedglass: 'stained-glass-panels',
  glass: 'stained-glass-panels',
  fusedart: 'fused-art',
  laserandsandblasting: 'laser-and-sandblasting',
  laser: 'laser-and-sandblasting',
  sandblasting: 'laser-and-sandblasting',
  sandblast: 'laser-and-sandblasting',
  woodart: 'wood-art',
  woodwork: 'wood-art',
  woodworking: 'wood-art',
  wood: 'wood-art',
  patterns: 'patterns',
  pattern: 'patterns',
}

const ALPHABET_FILTERS = ['all', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#']

const toAlphaBucket = (value) => {
  const firstChar = String(value || '').trim().charAt(0).toUpperCase()
  if (/^[A-Z]$/.test(firstChar)) return firstChar
  return '#'
}

const normalizeTypeKeyFromCategory = (value) => CATEGORY_TYPE_ALIASES[normalizeCategoryValue(value)] || null

const isTypeCategory = (value) => Boolean(normalizeTypeKeyFromCategory(value))

const toCategoryArray = (category) => {
  if (Array.isArray(category)) {
    return category.filter(Boolean)
  }

  if (typeof category === 'string') {
    const trimmed = category.trim()

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.filter(Boolean)
        }
      } catch {
        // ignore JSON parse errors
      }
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    }
  }

  return category ? [category] : []
}

const removeTypeCategories = (categories) => {
  return categories.filter((entry) => !isTypeCategory(entry))
}

const inferLegacyType = (product) => {
  const categoryText = normalizeText(product.category)
  const materialsText = normalizeText(product.materials)
  const titleText = normalizeText(product.title)
  const descriptionText = normalizeText(product.description)
  const combined = `${categoryText} ${materialsText} ${titleText} ${descriptionText}`

  const looksPattern = /pattern|template|svg|line\s*art|trace/.test(combined)
  const looksLaserOrSandblast = /laser|sandblast|sand\s*blast|engrave|etch/.test(combined)
  const looksFused = /fused|kiln|slump|melt/.test(combined)
  const looksWood = /wood|woodwork|timber|carv|oak|walnut|maple|cedar/.test(combined)

  if (looksPattern) return 'patterns'
  if (looksLaserOrSandblast) return 'laser-and-sandblasting'
  if (looksFused) return 'fused-art'
  if (looksWood) return 'wood-art'

  return 'stained-glass-panels'
}

export default function ProductPage({ products }) {
  const PRODUCTS_PER_PAGE = 12
  const titleCollator = useMemo(() => new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }), [])
  // eslint-disable-next-line no-unused-vars
  const { authToken } = useAuth();
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState('any')
  const [alphaFilter, setAlphaFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('stained-glass-panels')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [recentReviews, setRecentReviews] = useState([])
  const [activeReviewIndex, setActiveReviewIndex] = useState(0)
  const [reviewAnimationKey, setReviewAnimationKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let isActive = true
    fetchRecentReviews({ limit: 10 })
      .then((response) => {
        if (!isActive) return
        setRecentReviews(Array.isArray(response) ? response : [])
      })
      .catch(() => {
        if (!isActive) return
        setRecentReviews([])
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (recentReviews.length <= 1) {
      setActiveReviewIndex(0)
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveReviewIndex((prev) => (prev + 1) % recentReviews.length)
      setReviewAnimationKey((prev) => prev + 1)
    }, 5200)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [recentReviews.length])

  const sectionProducts = useMemo(() => {
    return products.filter((product) => {
      const categories = toCategoryArray(product.category)
      const normalizedTypes = categories
        .map((entry) => normalizeTypeKeyFromCategory(entry))
        .filter(Boolean)

      if (normalizedTypes.length > 0) {
        return normalizedTypes.includes(activeTab)
      }

      const inferredType = inferLegacyType(product)
      return inferredType === activeTab
    })
  }, [products, activeTab])

  const sectionLabel = PRODUCT_TABS.find((tab) => tab.key === activeTab)?.label || 'Products'

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 720)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const categoryCounts = useMemo(() => {
    const counts = { 
      All: sectionProducts.length,
      'On sale': sectionProducts.filter(p => p.old_price && p.old_price > p.price_amount).length
    }
    sectionProducts.forEach((product) => {
      const categories = removeTypeCategories(toCategoryArray(product.category))
      categories.forEach((category) => {
        counts[category] = (counts[category] || 0) + 1
      })
    })
    return counts
  }, [sectionProducts])

  const categories = useMemo(() => {
    const cats = ['All', 'On sale', ...Object.keys(categoryCounts).filter(c => c !== 'All' && c !== 'On sale')]
    return cats.filter(c => categoryCounts[c] > 0)
  }, [categoryCounts])

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    let result = sectionProducts.filter((product) => {
      let matchesCategory = true
      if (selectedCategory === 'All') {
        matchesCategory = true
      } else if (selectedCategory === 'On sale') {
        matchesCategory = product.old_price && product.old_price > product.price_amount
      } else {
        const categories = removeTypeCategories(toCategoryArray(product.category))
        matchesCategory = categories.includes(selectedCategory)
      }
      
      const matchesSearch =
        product.title?.toLowerCase().includes(lowerSearch) ||
        product.description?.toLowerCase().includes(lowerSearch)

      const matchesAlpha = alphaFilter === 'all'
        ? true
        : toAlphaBucket(product.title) === alphaFilter
      
      // Price filter
      let matchesPrice = true
      const price = product.price_amount || 0
      if (priceFilter === 'under100') matchesPrice = price < 100
      else if (priceFilter === '100to250') matchesPrice = price >= 100 && price <= 250
      else if (priceFilter === '250to500') matchesPrice = price >= 250 && price <= 500
      else if (priceFilter === 'over500') matchesPrice = price > 500
      
      return matchesCategory && matchesSearch && matchesPrice && matchesAlpha
    })

    return [...result].sort((a, b) => {
      const left = String(a?.title || '').trim()
      const right = String(b?.title || '').trim()
      return titleCollator.compare(left, right)
    })
  }, [sectionProducts, search, selectedCategory, priceFilter, alphaFilter, titleCollator])

  const isSectionComingSoon = sectionProducts.length === 0

  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * PRODUCTS_PER_PAGE
    return filtered.slice(start, start + PRODUCTS_PER_PAGE)
  }, [filtered, safeCurrentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, selectedCategory, priceFilter, alphaFilter, activeTab])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (selectedCategory !== 'All') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCategory('All')
    }
  }, [activeTab, selectedCategory])

  const activeReview = recentReviews[activeReviewIndex] || null

  return (
    <div className="product-page-wrapper">
      {/* Navigation Tabs */}
      <div className="shop-nav">
        <div className="shop-nav-inner">
          <div className="nav-tabs">
            {PRODUCT_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
            <a
              className="nav-tab"
              href="/#/designer"
              style={{ textDecoration: 'none' }}
            >
              Designer
            </a>
          </div>
          <div className="nav-search">
            <SearchBar search={search} setSearch={setSearch} totalItems={sectionProducts.length} />
          </div>
        </div>
      </div>

      <div className="shop-alpha-inline" aria-label="Filter products by first letter">
        {ALPHABET_FILTERS.map((entry) => {
          const label = entry === 'all' ? 'All' : entry
          const isActive = alphaFilter === entry
          return (
            <button
              key={entry}
              type="button"
              className={`shop-alpha-chip ${isActive ? 'active' : ''}`}
              onClick={() => setAlphaFilter(entry)}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Main Content Area */}
      <div className="product-page-layout">
        {/* Sidebar for desktop only */}
        {!isMobile && (
          <Sidebar
            categories={categories}
            categoryCounts={categoryCounts}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            totalProducts={products.length}
          />
        )}
        {/* Dropdown sidebar for mobile only */}
        {isMobile && (
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle categories">
            <span className="sidebar-toggle-icon">☰ Categories</span>
          </button>
        )}
        {isMobile && sidebarOpen && (
          <div className="sidebar-dropdown">
            <Sidebar
              categories={categories}
              categoryCounts={categoryCounts}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              totalProducts={sectionProducts.length}
            />
          </div>
        )}
        
        {/* Product List Area */}
        <main className="product-list-area">
          <div className="content-header">
            <h2 className="section-heading">{sectionLabel}</h2>
            <div className="filter-controls">
              <select 
                className="filter-dropdown" 
                value={priceFilter} 
                onChange={(e) => setPriceFilter(e.target.value)}
              >
                <option value="any">Price: Any price</option>
                <option value="under100">Under $100</option>
                <option value="100to250">$100 to $250</option>
                <option value="250to500">$250 to $500</option>
                <option value="over500">Over $500</option>
              </select>
            </div>
          </div>
          <div className="product-grid">
            {filtered.length === 0 ? (
              isSectionComingSoon ? (
                <div className="coming-soon-state" role="status" aria-live="polite">
                  <div className="coming-soon-badge">Coming soon</div>
                  <p className="coming-soon-text">
                    We&apos;re currently building this collection.
                  </p>
                  <div className="coming-soon-loader" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              ) : (
                <div className="empty-state">No products found.</div>
              )
            ) : (
              paginatedProducts.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))
            )}
          </div>
          {filtered.length > PRODUCTS_PER_PAGE && (
            <div className="product-pagination" aria-label="Product pages">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
              >
                Previous
              </button>
              <span>Page {safeCurrentPage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>

      <section className="product-page-reviews" aria-label="Recent customer reviews">
        
        {recentReviews.length === 0 ? (
          <p className="product-page-reviews-empty">No reviews yet.</p>
        ) : (
          <div className="product-page-review-stage">
            {activeReview ? (
              <article
                key={`${activeReview.id}-${reviewAnimationKey}`}
                className="product-page-review-card product-page-review-card-animated"
              >
                {activeReview.product_image_url ? (
                  <div className="product-page-review-image-shell">
                    <img
                      src={activeReview.product_image_url}
                      alt={activeReview.product_title || activeReview.title || 'Reviewed product'}
                      className="product-page-review-image"
                    />
                  </div>
                ) : null}
                <div className="product-page-review-content">
                  <p className="product-page-review-rating">{Number(activeReview.rating || 0)}/5</p>
                  <p className="product-page-review-title">{activeReview.title || 'Customer review'}</p>
                  <p className="product-page-review-body">{activeReview.body || ''}</p>
                  <p className="product-page-review-meta">
                    {(activeReview.first_name || '').trim()} {(activeReview.last_name || '').trim()}
                  </p>
                </div>
              </article>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
