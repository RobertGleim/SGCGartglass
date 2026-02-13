import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  createItem,
  fetchItemById,
  fetchItems,
  login,
  createManualProduct,
  fetchManualProducts,
  updateManualProduct,
  deleteManualProduct,
} from './lib/api'

const BRAND_NAME = 'SGCG Art Glass'

const getRoute = () => {
  const hash = window.location.hash.replace('#', '') || '/'
  const parts = hash.split('/').filter(Boolean)
  if (parts[0] === 'product' && parts[1]) {
    return { path: '/product', params: { id: parts[1] } }
  }
  if (parts[0] === 'admin') {
    return { path: '/admin', params: {} }
  }
  return { path: '/', params: {} }
}

function App() {
  const [route, setRoute] = useState(getRoute())
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [manualProducts, setManualProducts] = useState([])
  const [authToken, setAuthToken] = useState(
    () => window.localStorage.getItem('sgcg_token') || ''
  )

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let isActive = true
    setItemsLoading(true)
    fetchItems()
      .then((data) => {
        if (isActive) {
          setItems(data)
        }
      })
      .finally(() => {
        if (isActive) {
          setItemsLoading(false)
        }
      })
    
    // Fetch manual products
    fetchManualProducts()
      .then((data) => {
        if (isActive) {
          setManualProducts(data)
        }
      })
      .catch((error) => {
        console.error('Error fetching manual products:', error)
      })
    
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (route.path !== '/product') {
      setSelectedItem(null)
      return
    }
    const itemId = route.params.id
    if (!itemId) {
      setSelectedItem(null)
      return
    }
    
    // Check if it's a manual product (prefix with 'm-')
    if (itemId.startsWith('m-')) {
      const manualId = parseInt(itemId.substring(2))
      const manualProduct = manualProducts.find(p => p.id === manualId)
      if (manualProduct) {
        // Convert manual product to item format
        setSelectedItem({
          ...manualProduct,
          title: manualProduct.name,
          price_amount: manualProduct.price,
          price_currency: 'USD',
          image_url: manualProduct.images?.[0]?.image_url,
          isManual: true
        })
      }
    } else {
      fetchItemById(itemId).then((data) => setSelectedItem(data))
    }
  }, [route, manualProducts])

  // Combine Etsy items and manual products for featured display
  const allProducts = useMemo(() => {
    const manualItems = manualProducts.map(p => ({
      id: `m-${p.id}`,
      title: p.name,
      description: p.description,
      price_amount: p.price,
      price_currency: 'USD',
      image_url: p.images?.[0]?.image_url,
      category: p.category,
      isManual: true,
      is_featured: p.is_featured === 1 || p.is_featured === true,
      originalData: p
    }))
    return [...manualItems, ...items]
  }, [items, manualProducts])

  const featuredItems = useMemo(() => {
    // Prioritize featured products, then show remaining products
    const featured = allProducts.filter(p => p.is_featured)
    const nonFeatured = allProducts.filter(p => !p.is_featured)
    return [...featured, ...nonFeatured].slice(0, 8) // Show up to 8 items in carousel
  }, [allProducts])

  const [currentSlide, setCurrentSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const itemsPerPage = 4
  const totalSlides = Math.ceil(featuredItems.length / itemsPerPage)

  // Auto-scroll carousel
  useEffect(() => {
    if (!isPaused && featuredItems.length > itemsPerPage) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % totalSlides)
      }, 4000) // Change slide every 4 seconds
      return () => clearInterval(interval)
    }
  }, [isPaused, totalSlides, featuredItems.length, itemsPerPage])

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides)
  }

  const goToSlide = (index) => {
    setCurrentSlide(index)
  }

  const handleLogin = async (email, password) => {
    const token = await login(email, password)
    setAuthToken(token)
    window.localStorage.setItem('sgcg_token', token)
  }

  const handleAddItem = async (value) => {
    try {
      const created = await createItem(authToken, value)
      setItems((prev) => [created, ...prev])
      return created
    } catch (error) {
      // Auto-logout on authentication errors (expired/invalid token)
      if (error.message.includes('token') || error.message.includes('Unauthorized')) {
        setAuthToken('')
        window.localStorage.removeItem('sgcg_token')
        throw new Error('Session expired. Please log in again.')
      }
      throw error
    }
  }

  return (
    <div className="page">
      <header className="site-header">
        <div className="logo-block">
          <img src="/logo1.jpg" alt="SGCG Art Glass logo" />
          <div>
            <p className="logo-title">{BRAND_NAME}</p>
            <p className="logo-subtitle">Handcrafted glass studio</p>
          </div>
        </div>
        <nav className="nav-links">
          <a href="#/">Home</a>
          <a href="#/product">Product</a>
        </nav>
      </header>

      {route.path === '/' && (
        <main>
          <section className="hero">
            <div className="hero-content">
              <p className="eyebrow">Glass in motion</p>
              <h1>Gallery-worthy art glass made to glow.</h1>
              <p className="lead">
                Curated pieces from the SGCG Art Glass Etsy store, brought into a
                clean, modern gallery you control.
              </p>
              <div className="hero-actions">
                <a className="button primary" href="#/product">
                  View featured piece
                </a>
              </div>
            </div>
            <div className="hero-panel">
              <div className="hero-card">
                <p className="hero-label">Etsy synced</p>
                <h3>Automatic detail pulls</h3>
                <p>
                  Link a listing and the image, description, and price stay in
                  lockstep with your shop.
                </p>
              </div>
            </div>
          </section>

          <section className="featured">
            <div className="section-header">
              <h2>Featured items</h2>
              <p>Highlight the newest and most loved glasswork.</p>
            </div>
            {itemsLoading ? (
              <div className="empty-state">Loading featured items...</div>
            ) : featuredItems.length === 0 ? (
              <div className="empty-state">
                No Etsy items linked yet. Add listings from the admin page.
              </div>
            ) : (
              <div 
                className="carousel-container"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
              >
                <div className="carousel-wrapper">
                  <div 
                    className="carousel-track"
                    style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                  >
                    {Array.from({ length: totalSlides }).map((_, slideIndex) => (
                      <div key={slideIndex} className="carousel-slide">
                        {featuredItems
                          .slice(slideIndex * itemsPerPage, (slideIndex + 1) * itemsPerPage)
                          .map((item) => (
                            <article key={item.id} className="product-card">
                              <div className="card-image">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.title || 'Glass art'} />
                                ) : (
                                  <div className="image-placeholder">No image</div>
                                )}
                              </div>
                              <div className="card-body">
                                <h3>{item.title || 'Untitled piece'}</h3>
                                <p className="card-description">
                                  {item.description || 'Details will appear after Etsy sync.'}
                                </p>
                                <div className="card-meta">
                                  <span className="price">
                                    {item.price_amount || '--'}
                                    {item.price_currency ? ` ${item.price_currency}` : ''}
                                  </span>
                                  <a className="text-link" href={`#/product/${item.id}`}>
                                    View
                                  </a>
                                </div>
                              </div>
                            </article>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
                
                {totalSlides > 1 && (
                  <>
                    <button className="carousel-btn prev" onClick={prevSlide} aria-label="Previous">
                      ‹
                    </button>
                    <button className="carousel-btn next" onClick={nextSlide} aria-label="Next">
                      ›
                    </button>
                    
                    <div className="carousel-dots">
                      {Array.from({ length: totalSlides }).map((_, index) => (
                        <button
                          key={index}
                          className={`dot ${index === currentSlide ? 'active' : ''}`}
                          onClick={() => goToSlide(index)}
                          aria-label={`Go to slide ${index + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </main>
      )}

      {route.path === '/product' && (
        <main className="product-page">
          <section className="section-header">
            <h2>Featured product</h2>
            <p>Spotlight a single listing with rich detail.</p>
          </section>
          {!route.params.id && (
            <div className="empty-state">
              Select a product from the featured list to see the full page.
            </div>
          )}
          {route.params.id && !selectedItem && (
            <div className="empty-state">Loading product details...</div>
          )}
          {selectedItem && (
            <div className="product-detail">
              <div className="product-image">
                {selectedItem.image_url ? (
                  selectedItem.isManual && selectedItem.originalData?.images?.length > 1 ? (
                    <div className="image-gallery">
                      {selectedItem.originalData.images.map((img, idx) => (
                        <div key={idx} className="gallery-image">
                          {img.media_type === 'video' ? (
                            <video src={img.image_url} controls />
                          ) : (
                            <img src={img.image_url} alt={`${selectedItem.title} ${idx + 1}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <img
                      src={selectedItem.image_url}
                      alt={selectedItem.title || 'Glass art'}
                    />
                  )
                ) : (
                  <div className="image-placeholder">No image</div>
                )}
              </div>
              <div className="product-info">
                <h2>{selectedItem.title || 'Untitled piece'}</h2>
                <p className="price">
                  {selectedItem.price_amount || '--'}
                  {selectedItem.price_currency ? ` ${selectedItem.price_currency}` : ''}
                </p>
                <p className="card-description">
                  {selectedItem.description || 'Details will appear after Etsy sync.'}
                </p>
                {selectedItem.isManual ? (
                  <div className="product-details-list">
                    {selectedItem.originalData?.category && (
                      <p><strong>Category:</strong> {selectedItem.originalData.category}</p>
                    )}
                    {selectedItem.originalData?.materials && (
                      <p><strong>Materials:</strong> {selectedItem.originalData.materials}</p>
                    )}
                    {(selectedItem.originalData?.width || selectedItem.originalData?.height || selectedItem.originalData?.depth) && (
                      <p><strong>Dimensions:</strong> {[
                        selectedItem.originalData.width && `${selectedItem.originalData.width}"W`,
                        selectedItem.originalData.height && `${selectedItem.originalData.height}"H`,
                        selectedItem.originalData.depth && `${selectedItem.originalData.depth}"D`
                      ].filter(Boolean).join(' × ')}</p>
                    )}
                    {selectedItem.originalData?.quantity > 0 && (
                      <p><strong>Available:</strong> {selectedItem.originalData.quantity} in stock</p>
                    )}
                  </div>
                ) : selectedItem.etsy_url && (
                  <a className="button primary" href={selectedItem.etsy_url}>
                    View on Etsy
                  </a>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {route.path === '/admin' && (
        <main className="admin-page">
          {!authToken ? (
            <AdminLogin onLogin={handleLogin} />
          ) : (
            <AdminDashboard
              authToken={authToken}
              items={items}
              manualProducts={manualProducts}
              onAddItem={handleAddItem}
              onAddManualProduct={async (productData) => {
                const created = await createManualProduct(authToken, productData)
                setManualProducts((prev) => [created, ...prev])
                return created
              }}
              onUpdateManualProduct={async (id, productData) => {
                const updated = await updateManualProduct(authToken, id, productData)
                setManualProducts((prev) => prev.map(p => p.id === id ? updated : p))
                return updated
              }}
              onDeleteManualProduct={async (id) => {
                await deleteManualProduct(authToken, id)
                setManualProducts((prev) => prev.filter(p => p.id !== id))
              }}
              onLogout={() => {
                setAuthToken('')
                window.localStorage.removeItem('sgcg_token')
              }}
            />
          )}
        </main>
      )}

      <footer className="site-footer">
        <p>SGCG Art Glass · Etsy-connected gallery experience</p>
      </footer>
    </div>
  )
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('Signing in...')
    try {
      await onLogin(email, password)
    } catch {
      setStatus('Login failed. Check credentials.')
    }
  }

  return (
    <div className="admin-login">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h2>Admin Access</h2>
        <p className="form-note">Sign in to access the dashboard.</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            required
          />
        </label>
        <button className="button primary" type="submit">
          Sign in
        </button>
        {status && <p className="status-text">{status}</p>}
      </form>
    </div>
  )
}

function AdminDashboard({ items, manualProducts, onAddItem, onAddManualProduct, onUpdateManualProduct, onDeleteManualProduct, onLogout }) {
  const [listingValue, setListingValue] = useState('')
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState('products')
  const [showManualProductModal, setShowManualProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [manualProduct, setManualProduct] = useState({
    name: '',
    images: [],
    description: '',
    category: '',
    materials: '',
    width: '',
    height: '',
    depth: '',
    price: '',
    quantity: '',
    is_featured: false
  })

  const handleAddItemSubmit = async (event) => {
    event.preventDefault()
    if (!listingValue) {
      setStatus('Enter an Etsy listing URL or ID.')
      return
    }
    setStatus('Linking listing...')
    try {
      await onAddItem(listingValue)
      setListingValue('')
      setStatus('Listing linked successfully.')
    } catch {
      setStatus('Unable to link listing. Check Etsy API settings.')
    }
  }

  const handleManualProductSubmit = async (event) => {
    event.preventDefault()
    setStatus(editingProduct ? 'Updating product...' : 'Adding manual product...')
    
    console.log('Form state before processing:', manualProduct)
    
    try {
      // Convert images to base64
      const imagePromises = manualProduct.images.map((item) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            resolve({
              url: e.target.result,
              type: item.type
            })
          }
          reader.onerror = reject
          reader.readAsDataURL(item.file)
        })
      })
      
      const imageData = await Promise.all(imagePromises)
      console.log('Processed images:', imageData.length, 'images')
      
      const productData = {
        name: manualProduct.name.trim(),
        description: manualProduct.description.trim(),
        category: manualProduct.category?.trim() || null,
        materials: manualProduct.materials?.trim() || null,
        width: manualProduct.width ? parseFloat(manualProduct.width) : null,
        height: manualProduct.height ? parseFloat(manualProduct.height) : null,
        depth: manualProduct.depth ? parseFloat(manualProduct.depth) : null,
        price: parseFloat(manualProduct.price),
        quantity: parseInt(manualProduct.quantity, 10),
        is_featured: manualProduct.is_featured,
        images: imageData.length > 0 ? imageData : (editingProduct?.images || [])
      }
      
      console.log('Submitting product data:', productData)
      
      if (editingProduct) {
        await onUpdateManualProduct(editingProduct.id, productData)
        setStatus('Product updated successfully!')
      } else {
        await onAddManualProduct(productData)
        setStatus('Manual product added successfully!')
      }
      
      setShowManualProductModal(false)
      setEditingProduct(null)
      
      // Clean up preview URLs
      manualProduct.images.forEach(item => {
        URL.revokeObjectURL(item.preview)
      })
      
      // Reset form
      setManualProduct({
        name: '',
        images: [],
        description: '',
        category: '',
        materials: '',
        width: '',
        height: '',
        depth: '',
        price: '',
        quantity: '',
        is_featured: false
      })
    } catch (error) {
      console.error('Error adding manual product:', error)
      setStatus(`Error: ${error.message}`)
    }
  }
  
  const handleEditProduct = (product) => {
    setEditingProduct(product)
    setManualProduct({
      name: product.name || '',
      images: [],
      description: product.description || '',
      category: product.category || '',
      materials: product.materials || '',
      width: product.width?.toString() || '',
      height: product.height?.toString() || '',
      depth: product.depth?.toString() || '',
      price: product.price?.toString() || '',
      quantity: product.quantity?.toString() || '',
      is_featured: product.is_featured === 1 || product.is_featured === true
    })
    setShowManualProductModal(true)
  }
  
  const handleDeleteProduct = async (product) => {
    const confirmDelete = window.confirm(
      `⚠️ Delete Product?\n\nAre you sure you want to permanently delete "${product.name}"?\n\nThis action cannot be undone.`
    )
    
    if (confirmDelete) {
      try {
        setStatus('Deleting product...')
        await onDeleteManualProduct(product.id)
        setStatus('Product deleted successfully!')
      } catch (error) {
        setStatus(`Error deleting product: ${error.message}`)
      }
    }
  }
  
  const handleCloseModal = () => {
    setShowManualProductModal(false)
    setEditingProduct(null)
    setManualProduct({
      name: '',
      images: [],
      description: '',
      category: '',
      materials: '',
      width: '',
      height: '',
      depth: '',
      price: '',
      quantity: '',
      is_featured: false
    })
  }

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files)
    // Store file objects and create preview URLs
    setManualProduct(prev => ({
      ...prev,
      images: [...prev.images, ...files.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' : 'image'
      }))]
    }))
  }

  const removeImage = (index) => {
    setManualProduct(prev => {
      const newImages = [...prev.images]
      // Revoke URL to prevent memory leaks
      URL.revokeObjectURL(newImages[index].preview)
      newImages.splice(index, 1)
      return { ...prev, images: newImages }
    })
  }

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Admin Dashboard</h2>
          <p>Manage products and view analytics.</p>
        </div>
        <button className="button" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Products
        </button>
        <button
          className={`tab ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          Sales Stats
        </button>
        <button
          className={`tab ${activeTab === 'etsy' ? 'active' : ''}`}
          onClick={() => setActiveTab('etsy')}
        >
          Etsy Analytics
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'products' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Add Etsy Listing</h3>
              <form className="inline-form" onSubmit={handleAddItemSubmit}>
                <input
                  type="text"
                  value={listingValue}
                  onChange={(event) => setListingValue(event.target.value)}
                  placeholder="Paste Etsy listing URL or ID"
                  required
                />
                <button className="button primary" type="submit">
                  Link listing
                </button>
              </form>
              {status && <p className="status-text">{status}</p>}
            </div>

            <div className="panel-section">
              <h3>Add Manual Product</h3>
              <p className="form-note">Add products that are not listed on Etsy</p>
              <button 
                className="button primary" 
                type="button"
                onClick={() => setShowManualProductModal(true)}
              >
                Add Product
              </button>
            </div>

            <div className="panel-section">
              <h3>Linked Products ({items.length})</h3>
              {items.length === 0 ? (
                <div className="empty-state">No products linked yet.</div>
              ) : (
                <div className="product-list">
                  {items.map((item) => (
                    <div key={item.id} className="product-row">
                      <div className="product-thumb">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.title || 'Product'} />
                        ) : (
                          <div className="thumb-placeholder">No image</div>
                        )}
                      </div>
                      <div className="product-details">
                        <h4>{item.title || 'Untitled'}</h4>
                        <p className="product-meta">
                          {item.price_amount && `${item.price_amount} ${item.price_currency || ''}`}
                        </p>
                      </div>
                      <a
                        className="text-link"
                        href={item.etsy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on Etsy
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel-section">
              <h3>Manual Products ({manualProducts.length})</h3>
              {manualProducts.length === 0 ? (
                <div className="empty-state">No manual products added yet.</div>
              ) : (
                <div className="product-list">
                  {manualProducts.map((product) => (
                    <div key={product.id} className="product-row">
                      <div className="product-thumb">
                        {product.images && product.images.length > 0 ? (
                          product.images[0].media_type === 'video' ? (
                            <video src={product.images[0].image_url} className="thumb-placeholder" />
                          ) : (
                            <img src={product.images[0].image_url} alt={product.name} />
                          )
                        ) : (
                          <div className="thumb-placeholder">No image</div>
                        )}
                      </div>
                      <div className="product-details">
                        <h4>
                          {product.name}
                          {(product.is_featured === 1 || product.is_featured === true) && (
                            <span className="featured-badge">★ Featured</span>
                          )}
                        </h4>
                        <p className="product-meta">
                          ${product.price} · Qty: {product.quantity}
                          {product.category && ` · ${product.category}`}
                        </p>
                      </div>
                      <div className="product-actions">
                        <button
                          className="button-icon edit"
                          onClick={() => handleEditProduct(product)}
                          title="Edit product"
                        >
                          ✎
                        </button>
                        <button
                          className="button-icon delete"
                          onClick={() => handleDeleteProduct(product)}
                          title="Delete product"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Sales Overview</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-label">Total Sales</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Revenue</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Avg. Order Value</p>
                  <p className="stat-value">Coming soon</p>
                </div>
              </div>
              <p className="form-note">Sales tracking will be integrated in a future update.</p>
            </div>
          </div>
        )}

        {activeTab === 'etsy' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Etsy Store Analytics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-label">Views</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Favorites</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Orders</p>
                  <p className="stat-value">Coming soon</p>
                </div>
              </div>
              <p className="form-note">
                Connect Etsy OAuth to pull real-time shop analytics. Rate limit: 5 QPS, 5K QPD.
              </p>
            </div>
          </div>
        )}
      </div>

      {showManualProductModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProduct ? 'Edit Product' : 'Add Manual Product'}</h2>
              <button 
                className="modal-close" 
                onClick={handleCloseModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleManualProductSubmit}>
              <label>
                Product Name *
                <input
                  type="text"
                  value={manualProduct.name}
                  onChange={(e) => setManualProduct({...manualProduct, name: e.target.value})}
                  placeholder="Enter product name"
                  required
                />
              </label>

              <label>
                Images / Video
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleImageUpload}
                />
                <span className="form-note">Upload multiple images or a video</span>
              </label>

              {manualProduct.images.length > 0 && (
                <div className="image-preview-grid">
                  {manualProduct.images.map((item, index) => (
                    <div key={index} className="image-preview-item">
                      {item.type === 'video' ? (
                        <video src={item.preview} controls className="preview-media" />
                      ) : (
                        <img src={item.preview} alt={`Preview ${index + 1}`} className="preview-media" />
                      )}
                      <button
                        type="button"
                        className="remove-media-btn"
                        onClick={() => removeImage(index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label>
                Description *
                <textarea
                  value={manualProduct.description}
                  onChange={(e) => setManualProduct({...manualProduct, description: e.target.value})}
                  placeholder="Enter product description"
                  rows="4"
                  required
                />
              </label>

              <label>
                Category
                <input
                  type="text"
                  value={manualProduct.category}
                  onChange={(e) => setManualProduct({...manualProduct, category: e.target.value})}
                  placeholder="e.g., Vase, Bowl, Sculpture"
                />
              </label>

              <label>
                Materials
                <input
                  type="text"
                  value={manualProduct.materials}
                  onChange={(e) => setManualProduct({...manualProduct, materials: e.target.value})}
                  placeholder="e.g., Hand-blown glass, Stained glass"
                />
              </label>

              <div className="size-inputs">
                <label>
                  Width (inches)
                  <input
                    type="number"
                    step="0.01"
                    value={manualProduct.width}
                    onChange={(e) => setManualProduct({...manualProduct, width: e.target.value})}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Height (inches)
                  <input
                    type="number"
                    step="0.01"
                    value={manualProduct.height}
                    onChange={(e) => setManualProduct({...manualProduct, height: e.target.value})}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Depth (inches)
                  <input
                    type="number"
                    step="0.01"
                    value={manualProduct.depth}
                    onChange={(e) => setManualProduct({...manualProduct, depth: e.target.value})}
                    placeholder="0.00"
                  />
                </label>
              </div>

              <div className="price-quantity-inputs">
                <label>
                  Price *
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualProduct.price}
                    onChange={(e) => setManualProduct({...manualProduct, price: e.target.value})}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Quantity *
                  <input
                    type="number"
                    min="0"
                    value={manualProduct.quantity}
                    onChange={(e) => setManualProduct({...manualProduct, quantity: e.target.value})}
                    placeholder="0"
                    required
                  />
                </label>
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={manualProduct.is_featured}
                  onChange={(e) => setManualProduct({...manualProduct, is_featured: e.target.checked})}
                />
                <span>Feature this product on the home page</span>
              </label>

              <div className="modal-actions">
                <button type="button" className="button" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="button primary">
                  {editingProduct ? 'Update Product' : 'Add Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
