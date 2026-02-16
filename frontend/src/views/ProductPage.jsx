import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import SearchBar from '../components/SearchBar';
import './ProductPage.css';

export default function ProductPage({ products }) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState('any')
  const [sortBy, setSortBy] = useState('recent')
  const [activeTab, setActiveTab] = useState('items')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 720)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const categoryCounts = useMemo(() => {
    const counts = { 
      All: products.length,
      'On sale': products.filter(p => p.old_price && p.old_price > p.price_amount).length
    }
    products.forEach((product) => {
      if (product.category) {
        counts[product.category] = (counts[product.category] || 0) + 1
      }
    })
    return counts
  }, [products])

  const categories = useMemo(() => {
    const cats = ['All', 'On sale', ...Object.keys(categoryCounts).filter(c => c !== 'All' && c !== 'On sale')]
    return cats.filter(c => categoryCounts[c] > 0)
  }, [categoryCounts])

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    let result = products.filter((product) => {
      let matchesCategory = true
      if (selectedCategory === 'All') {
        matchesCategory = true
      } else if (selectedCategory === 'On sale') {
        matchesCategory = product.old_price && product.old_price > product.price_amount
      } else {
        matchesCategory = product.category === selectedCategory
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
  }, [products, search, selectedCategory, priceFilter, sortBy])

  return (
    <div className="product-page-wrapper">
      {/* Navigation Tabs */}
      <div className="shop-nav">
        <div className="shop-nav-inner">
          <div className="nav-tabs">
            <button 
              className={`nav-tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              Items
            </button>
            <button 
              className={`nav-tab ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              Reviews
            </button>
            <button 
              className={`nav-tab ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              About
            </button>
            <button 
              className={`nav-tab ${activeTab === 'policies' ? 'active' : ''}`}
              onClick={() => setActiveTab('policies')}
            >
              Shop Policies
            </button>
          </div>
          <div className="nav-search">
            <SearchBar search={search} setSearch={setSearch} totalItems={products.length} />
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
              totalProducts={products.length}
            />
          </div>
        )}
        
        {/* Product List Area */}
        <main className="product-list-area">
          <div className="content-header">
            <h2 className="section-heading">All items</h2>
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
