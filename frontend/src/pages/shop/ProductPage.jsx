import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../../components/product/Sidebar';
import ProductCard from '../../components/product/ProductCard';
import SearchBar from '../../components/common/SearchBar';
import '../../styles/ProductPage.css';
import useAuth from '../../hooks/useAuth';

const normalizeText = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '')).join(' ').toLowerCase()
  }
  return String(value || '').toLowerCase()
}

const normalizeCategoryValue = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const isGlassTypeCategory = (value) => {
  const normalized = normalizeCategoryValue(value)
  return normalized === 'stainedglass' || normalized === 'glass'
}

const isWoodTypeCategory = (value) => {
  const normalized = normalizeCategoryValue(value)
  return normalized === 'woodwork' || normalized === 'wood' || normalized === 'woodworking'
}

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
  return categories.filter((entry) => !isGlassTypeCategory(entry) && !isWoodTypeCategory(entry))
}

const inferLegacyType = (product) => {
  const categoryText = normalizeText(product.category)
  const materialsText = normalizeText(product.materials)
  const titleText = normalizeText(product.title)
  const descriptionText = normalizeText(product.description)
  const combined = `${categoryText} ${materialsText} ${titleText} ${descriptionText}`

  const looksWood = /wood|woodwork|timber|carv|oak|walnut|maple|cedar/.test(combined)
  const looksGlass = /glass|stained|suncatcher|sun catcher|panel|lead came|copper foil/.test(combined)

  if (looksWood && !looksGlass) {
    return 'wood-work'
  }

  if (looksGlass && !looksWood) {
    return 'stained-glass'
  }

  // Default legacy/unclear products to stained glass so existing catalog items remain visible.
  return 'stained-glass'
}

export default function ProductPage({ products }) {
  // eslint-disable-next-line no-unused-vars
  const { authToken } = useAuth();
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState('any')
  const [sortBy, setSortBy] = useState('recent')
  const [activeTab, setActiveTab] = useState('stained-glass')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const sectionProducts = useMemo(() => {
    return products.filter((product) => {
      const categories = toCategoryArray(product.category)
      const hasGlassType = categories.some((entry) => isGlassTypeCategory(entry))
      const hasWoodType = categories.some((entry) => isWoodTypeCategory(entry))

      if (hasGlassType || hasWoodType) {
        if (activeTab === 'wood-work') {
          return hasWoodType && !hasGlassType
        }

        return hasGlassType && !hasWoodType
      }

      const inferredType = inferLegacyType(product)
      return inferredType === activeTab
    })
  }, [products, activeTab])

  const sectionLabel = activeTab === 'wood-work' ? 'Wood Work' : 'Stained Glass'

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
      
      // Price filter
      let matchesPrice = true
      const price = product.price_amount || 0
      if (priceFilter === 'under100') matchesPrice = price < 100
      else if (priceFilter === '100to250') matchesPrice = price >= 100 && price <= 250
      else if (priceFilter === '250to500') matchesPrice = price >= 250 && price <= 500
      else if (priceFilter === 'over500') matchesPrice = price > 500
      
      return matchesCategory && matchesSearch && matchesPrice
    })
    
    // Sort
    if (sortBy === 'featured') {
      result = result.filter(p => p.is_featured)
    } else if (sortBy === 'lowest') {
      result = [...result].sort((a, b) => (a.price_amount || 0) - (b.price_amount || 0))
    } else if (sortBy === 'highest') {
      result = [...result].sort((a, b) => (b.price_amount || 0) - (a.price_amount || 0))
    } else if (sortBy === 'recent') {
      // Sort by created_at timestamp (newest first)
      result = [...result].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0)
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0)
        return dateB - dateA
      })
    }
    
    return result
  }, [sectionProducts, search, selectedCategory, priceFilter, sortBy])

  useEffect(() => {
    if (selectedCategory !== 'All') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCategory('All')
    }
  }, [activeTab, selectedCategory])

  return (
    <div className="product-page-wrapper">
      {/* Navigation Tabs */}
      <div className="shop-nav">
        <div className="shop-nav-inner">
          <div className="nav-tabs">
            <button 
              className={`nav-tab ${activeTab === 'stained-glass' ? 'active' : ''}`}
              onClick={() => setActiveTab('stained-glass')}
            >
              Stained Glass
            </button>
            <button 
              className={`nav-tab ${activeTab === 'wood-work' ? 'active' : ''}`}
              onClick={() => setActiveTab('wood-work')}
            >
              Wood Work
            </button>
          </div>
          <div className="nav-search">
            <SearchBar search={search} setSearch={setSearch} totalItems={sectionProducts.length} />
          </div>
        </div>
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
              <select 
                className="filter-dropdown" 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="recent">Sort: Most Recent</option>
                <option value="featured">Featured Items</option>
                <option value="lowest">Lowest Price</option>
                <option value="highest">Highest Price</option>
              </select>
            </div>
          </div>
          <div className="product-grid">
            {filtered.length === 0 ? (
              <div className="empty-state">No products found.</div>
            ) : (
              filtered.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
