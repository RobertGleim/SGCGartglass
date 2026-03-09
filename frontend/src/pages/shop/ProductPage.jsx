import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import ProductCard from './components/ProductCard';
import SearchBar from './components/SearchBar';
import './ProductPage.css';
import {
  fetchFavoritesSummary,
  fetchRecentReviews,
  submitShopContactRequest,
  submitShopCustomOrderRequest,
} from '../../services/api';

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
const CONTACT_REASONS = [
  'General Question',
  'Custom Order',
  'Existing Order',
  'Shipping',
  'Returns',
  'Pricing',
  'Other',
]

const toAlphaBucket = (value) => {
  const firstChar = String(value || '').trim().charAt(0).toUpperCase()
  if (/^[A-Z]$/.test(firstChar)) return firstChar
  return '#'
}

const normalizeTypeKeyFromCategory = (value) => CATEGORY_TYPE_ALIASES[normalizeCategoryValue(value)] || null
const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Math.round(Number(rating) || 0))))

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
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState('any')
  const [alphaFilter, setAlphaFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('stained-glass-panels')
  const [recentReviews, setRecentReviews] = useState([])
  const [favoritesTotal, setFavoritesTotal] = useState(0)
  const [activeReviewIndex, setActiveReviewIndex] = useState(0)
  const [reviewAnimationKey, setReviewAnimationKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [showCustomOrderModal, setShowCustomOrderModal] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [customOrderSubmitting, setCustomOrderSubmitting] = useState(false)
  const [contactSubmitting, setContactSubmitting] = useState(false)
  const [customOrderStatus, setCustomOrderStatus] = useState('')
  const [contactStatus, setContactStatus] = useState('')
  const [customOrderForm, setCustomOrderForm] = useState({
    name: '',
    email: '',
    phone: '',
    project_name: '',
    category: '',
    materials: '',
    width: '',
    height: '',
    depth: '',
    budget: '',
    quantity: '',
    description: '',
  })
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    reason: CONTACT_REASONS[0],
    message: '',
  })

  useEffect(() => {
    let isActive = true
    fetchFavoritesSummary()
      .then((response) => {
        if (!isActive) return
        const total = Number(response?.total)
        setFavoritesTotal(Number.isFinite(total) && total > 0 ? total : 0)
      })
      .catch(() => {
        if (!isActive) return
        setFavoritesTotal(0)
      })

    return () => {
      isActive = false
    }
  }, [])

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

  const panelLikesCount = useMemo(() => {
    return Number.isFinite(Number(favoritesTotal)) ? Number(favoritesTotal) : 0
  }, [favoritesTotal])

  const averageStarReview = useMemo(() => {
    if (!Array.isArray(recentReviews) || recentReviews.length === 0) return null
    const ratings = recentReviews
      .map((review) => Number(review?.rating))
      .filter((rating) => Number.isFinite(rating) && rating > 0)
    if (ratings.length === 0) return null
    const avg = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    return Number(avg.toFixed(1))
  }, [recentReviews])

  const openCustomOrderModal = () => {
    setCustomOrderStatus('')
    setCustomOrderForm((prev) => ({
      ...prev,
      project_name: prev.project_name || sectionLabel,
    }))
    setShowCustomOrderModal(true)
  }

  const openContactModal = () => {
    setContactStatus('')
    setShowContactModal(true)
  }

  const handleSubmitCustomOrder = async (event) => {
    event.preventDefault()
    setCustomOrderStatus('')
    setCustomOrderSubmitting(true)
    try {
      await submitShopCustomOrderRequest({
        ...customOrderForm,
        tag: 'CUSTOM_ORDER',
        request_type: 'custom_order',
        category: customOrderForm.category,
        materials: customOrderForm.materials,
      })
      setCustomOrderStatus('Custom order request sent. We will contact you shortly.')
      setCustomOrderForm({
        name: '',
        email: '',
        phone: '',
        project_name: sectionLabel,
        category: '',
        materials: '',
        width: '',
        height: '',
        depth: '',
        budget: '',
        quantity: '',
        description: '',
      })
    } catch {
      setCustomOrderStatus('Unable to send request right now. Please try again.')
    } finally {
      setCustomOrderSubmitting(false)
    }
  }

  const handleSubmitContact = async (event) => {
    event.preventDefault()
    setContactStatus('')
    setContactSubmitting(true)
    try {
      await submitShopContactRequest({
        ...contactForm,
        tag: 'QUESTION',
        request_type: 'question',
      })
      setContactStatus('Message sent. Our customer service team will reply soon.')
      setContactForm({
        name: '',
        phone: '',
        email: '',
        reason: CONTACT_REASONS[0],
        message: '',
      })
    } catch {
      setContactStatus('Unable to send message right now. Please try again.')
    } finally {
      setContactSubmitting(false)
    }
  }

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
        <Sidebar
          categories={categories}
          categoryCounts={categoryCounts}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          totalProducts={products.length}
          panelLikesCount={panelLikesCount}
          averageStarReview={averageStarReview}
          onOpenCustomOrder={openCustomOrderModal}
          onOpenContactOwner={openContactModal}
        />
        
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
                  <p className="product-page-review-rating">{renderStars(activeReview.rating)}</p>
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

      {showCustomOrderModal && (
        <div className="shop-form-modal-overlay" onClick={() => setShowCustomOrderModal(false)}>
          <div className="shop-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="shop-form-modal-header">
              <h3>Request Custom Order</h3>
              <button type="button" onClick={() => setShowCustomOrderModal(false)}>×</button>
            </div>
            <form className="shop-form-grid" onSubmit={handleSubmitCustomOrder}>
              <input required placeholder="Name" value={customOrderForm.name} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input required type="email" placeholder="Email" value={customOrderForm.email} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, email: event.target.value }))} />
              <input placeholder="Phone" value={customOrderForm.phone} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, phone: event.target.value }))} />
              <input placeholder="Project Name" value={customOrderForm.project_name} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, project_name: event.target.value }))} />
              <input placeholder="Category (example: Geometric)" value={customOrderForm.category} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, category: event.target.value }))} />
              <input placeholder="Materials (example: bevel, clear glass)" value={customOrderForm.materials} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, materials: event.target.value }))} />
              <div className="shop-form-row-3">
                <input placeholder="Width" value={customOrderForm.width} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, width: event.target.value }))} />
                <input placeholder="Height" value={customOrderForm.height} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, height: event.target.value }))} />
                <input placeholder="Depth" value={customOrderForm.depth} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, depth: event.target.value }))} />
              </div>
              <div className="shop-form-row-2">
                <input placeholder="Budget" value={customOrderForm.budget} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, budget: event.target.value }))} />
                <input placeholder="Quantity" value={customOrderForm.quantity} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, quantity: event.target.value }))} />
              </div>
              <textarea required rows={5} placeholder="Describe your custom order request" value={customOrderForm.description} onChange={(event) => setCustomOrderForm((prev) => ({ ...prev, description: event.target.value }))} />
              {customOrderStatus && <p className="shop-form-status">{customOrderStatus}</p>}
              <button type="submit" className="shop-form-submit" disabled={customOrderSubmitting}>
                {customOrderSubmitting ? 'Sending...' : 'Send Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showContactModal && (
        <div className="shop-form-modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="shop-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="shop-form-modal-header">
              <h3>Contact Shop Owner</h3>
              <button type="button" onClick={() => setShowContactModal(false)}>×</button>
            </div>
            <form className="shop-form-grid" onSubmit={handleSubmitContact}>
              <input required placeholder="Name" value={contactForm.name} onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input placeholder="Phone" value={contactForm.phone} onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))} />
              <input required type="email" placeholder="Email" value={contactForm.email} onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))} />
              <select value={contactForm.reason} onChange={(event) => setContactForm((prev) => ({ ...prev, reason: event.target.value }))}>
                {CONTACT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <textarea required rows={6} placeholder="Write your message" value={contactForm.message} onChange={(event) => setContactForm((prev) => ({ ...prev, message: event.target.value }))} />
              {contactStatus && <p className="shop-form-status">{contactStatus}</p>}
              <button type="submit" className="shop-form-submit" disabled={contactSubmitting}>
                {contactSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
