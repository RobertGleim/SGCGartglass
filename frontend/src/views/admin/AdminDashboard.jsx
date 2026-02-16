import { useState } from 'react'
import '../../styles/AdminDashboard.css'

export default function AdminDashboard({ items, manualProducts, onAddItem, onAddManualProduct, onUpdateManualProduct, onDeleteManualProduct, onLogout }) {
  const [listingValue, setListingValue] = useState('')
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState('products')
  const [showManualProductModal, setShowManualProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [favoriteCategories, setFavoriteCategories] = useState(['Vase', 'Bowl', 'Sculpture'])
  const [favoriteMaterials, setFavoriteMaterials] = useState(['Hand-blown glass', 'Stained glass', 'Fused glass'])
  const [manualProduct, setManualProduct] = useState({
    name: '',
    images: [],
    description: '',
    category: [],
    materials: [],
    width: '',
    height: '',
    depth: '',
    price: '',
    quantity: '',
    is_featured: false
  })
  const [categoryInput, setCategoryInput] = useState('')
  const [materialInput, setMaterialInput] = useState('')

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
    try {
      const productData = {
        name: manualProduct.name.trim(),
        description: manualProduct.description.trim(),
        category: manualProduct.category.length > 0 ? manualProduct.category : null,
        materials: manualProduct.materials.length > 0 ? manualProduct.materials : null,
        width: manualProduct.width ? parseFloat(manualProduct.width) : null,
        height: manualProduct.height ? parseFloat(manualProduct.height) : null,
        depth: manualProduct.depth ? parseFloat(manualProduct.depth) : null,
        price: parseFloat(manualProduct.price),
        quantity: parseInt(manualProduct.quantity, 10),
        is_featured: manualProduct.is_featured,
        images: manualProduct.images || []
      }
      if (editingProduct) {
        await onUpdateManualProduct(editingProduct.id, productData)
        setStatus('Product updated successfully!')
      } else {
        await onAddManualProduct(productData)
        setStatus('Manual product added successfully!')
      }
      setShowManualProductModal(false)
      setEditingProduct(null)
      setManualProduct({
        name: '',
        images: [],
        description: '',
        category: [],
        materials: [],
        width: '',
        height: '',
        depth: '',
        price: '',
        quantity: '',
        is_featured: false
      })
    } catch (error) {
      setStatus(`Error: ${error.message}`)
    }
  }

  const handleEditProduct = (product) => {
    setEditingProduct(product)
    setManualProduct({
      name: product.name || '',
      images: product.images || [],
      description: product.description || '',
      category: Array.isArray(product.category) ? product.category : (product.category ? [product.category] : []),
      materials: Array.isArray(product.materials) ? product.materials : (product.materials ? [product.materials] : []),
      width: product.width?.toString() || '',
      height: product.height?.toString() || '',
      depth: product.depth?.toString() || '',
      price: product.price?.toString() || '',
      quantity: product.quantity?.toString() || '',
      is_featured: product.is_featured === 1 || product.is_featured === true
    })
    setCategoryInput('')
    setMaterialInput('')
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
      category: [],
      materials: [],
      width: '',
      height: '',
      depth: '',
      price: '',
      quantity: '',
      is_featured: false
    })
    setCategoryInput('')
    setMaterialInput('')
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
                          {product.category && ` · ${Array.isArray(product.category) ? product.category.join(', ') : product.category}`}
                          {product.materials && ` · ${Array.isArray(product.materials) ? product.materials.join(', ') : product.materials}`}
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
                  onChange={(e) => setManualProduct({...manualProduct, images: Array.from(e.target.files)})}
                />
                <span className="form-note">Upload multiple images or a video</span>
              </label>

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
                Categories
                <div className="multi-select-wrapper">
                  <div className="multi-select-inner">
                    <div className="multi-select-row">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value && !manualProduct.category.includes(e.target.value)) {
                            setManualProduct({...manualProduct, category: [...manualProduct.category, e.target.value]})
                          }
                        }}
                        className="multi-select-dropdown"
                      >
                        <option value="">Select a favorite category...</option>
                        {favoriteCategories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (categoryInput.trim() && !manualProduct.category.includes(categoryInput.trim())) {
                            setManualProduct({...manualProduct, category: [...manualProduct.category, categoryInput.trim()]})
                            if (!favoriteCategories.includes(categoryInput.trim())) {
                              setFavoriteCategories([...favoriteCategories, categoryInput.trim()])
                            }
                            setCategoryInput('')
                          }
                        }}
                        title="Add category"
                        className="multi-select-add-btn"
                      >
                        + Add
                      </button>
                    </div>
                    <input
                      type="text"
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (categoryInput.trim() && !manualProduct.category.includes(categoryInput.trim())) {
                            setManualProduct({...manualProduct, category: [...manualProduct.category, categoryInput.trim()]})
                            if (!favoriteCategories.includes(categoryInput.trim())) {
                              setFavoriteCategories([...favoriteCategories, categoryInput.trim()])
                            }
                            setCategoryInput('')
                          }
                        }
                      }}
                      placeholder="Or type and press Enter"
                      className="multi-select-input"
                    />
                    {manualProduct.category.length > 0 && (
                      <div className="multi-select-tags">
                        {manualProduct.category.map((cat) => (
                          <div
                            key={cat}
                            className="category-tag"
                          >
                            {cat}
                            <button
                              type="button"
                              onClick={() => {
                                setManualProduct({...manualProduct, category: manualProduct.category.filter(c => c !== cat)})
                              }}
                              className="category-tag-remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </label>

              <label>
                Materials
                <div className="multi-select-wrapper">
                  <div className="multi-select-inner">
                    <div className="multi-select-row">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value && !manualProduct.materials.includes(e.target.value)) {
                            setManualProduct({...manualProduct, materials: [...manualProduct.materials, e.target.value]})
                          }
                        }}
                        className="multi-select-dropdown"
                      >
                        <option value="">Select a favorite material...</option>
                        {favoriteMaterials.map((mat) => (
                          <option key={mat} value={mat}>{mat}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (materialInput.trim() && !manualProduct.materials.includes(materialInput.trim())) {
                            setManualProduct({...manualProduct, materials: [...manualProduct.materials, materialInput.trim()]})
                            if (!favoriteMaterials.includes(materialInput.trim())) {
                              setFavoriteMaterials([...favoriteMaterials, materialInput.trim()])
                            }
                            setMaterialInput('')
                          }
                        }}
                        title="Add material"
                        className="multi-select-add-btn"
                      >
                        + Add
                      </button>
                    </div>
                    <input
                      type="text"
                      value={materialInput}
                      onChange={(e) => setMaterialInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (materialInput.trim() && !manualProduct.materials.includes(materialInput.trim())) {
                            setManualProduct({...manualProduct, materials: [...manualProduct.materials, materialInput.trim()]})
                            if (!favoriteMaterials.includes(materialInput.trim())) {
                              setFavoriteMaterials([...favoriteMaterials, materialInput.trim()])
                            }
                            setMaterialInput('')
                          }
                        }
                      }}
                      placeholder="Or type and press Enter"
                      className="multi-select-input"
                    />
                    {manualProduct.materials.length > 0 && (
                      <div className="multi-select-tags">
                        {manualProduct.materials.map((mat) => (
                          <div
                            key={mat}
                            className="material-tag"
                          >
                            {mat}
                            <button
                              type="button"
                              onClick={() => {
                                setManualProduct({...manualProduct, materials: manualProduct.materials.filter(m => m !== mat)})
                              }}
                              className="material-tag-remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
                    style={{ width: '130px' }}
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
                    style={{ width: '130px' }}
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
                    style={{ width: '130px' }}
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
                    style={{ width: '130px' }}
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
