import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import SearchBar from '../components/SearchBar';
import './ProductPage.css';

export default function ProductPage({ products }) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
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
    return products.filter((product) => {
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
      return matchesCategory && matchesSearch
    })
  }, [products, search, selectedCategory])

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
            <h2 className="section-heading">Featured items</h2>
            <div className="filter-controls">
              <select className="filter-dropdown">
                <option>Price: Any price</option>
                <option>Under $25</option>
                <option>$25 to $50</option>
                <option>$50 to $100</option>
                <option>Over $100</option>
              </select>
              <select className="filter-dropdown">
                <option>Sort: Most Recent</option>
                <option>Lowest Price</option>
                <option>Highest Price</option>
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
          
          {/* All Items Section */}
          {filtered.length > 0 && (
            <>
              <h2 className="section-heading all-items-heading">All items</h2>
              <div className="product-grid">
                {filtered.map((product) => (
                  <ProductCard product={product} key={`all-${product.id}`} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
