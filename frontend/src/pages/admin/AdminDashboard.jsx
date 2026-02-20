import { useState, useEffect, useRef } from 'react'
import AddEtsyListingForm from '../../components/forms/AddEtsyListingForm'
import '../../styles/AdminDashboard.css'
import '../../styles/forms/stainedglass_form.css'
import '../../styles/forms/woodwork_form.css'

const toSearchableText = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '')).join(' ').toLowerCase()
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).toLowerCase()
}

const toDisplayList = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '')).filter(Boolean).join(', ')
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

export default function AdminDashboard({ items = [], manualProducts = [], onAddItem, onAddManualProduct, onUpdateManualProduct, onDeleteManualProduct, onLogout }) {
  const GLASS_CATEGORY_LABEL = 'Stained Glass'
  const WOOD_CATEGORY_LABEL = 'Wood Work'

  const [activeTab, setActiveTab] = useState('products')
  // eslint-disable-next-line no-unused-vars
  const [status, setStatus] = useState('')
  const [manualProductSearch, setManualProductSearch] = useState('')
  const [showManualProductModal, setShowManualProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productType, setProductType] = useState('stainedGlass') // 'stainedGlass' or 'woodwork'
  const [favoriteCategoriesByType, setFavoriteCategoriesByType] = useState(() => {
    const savedByType = localStorage.getItem('favoriteCategoriesByType')
    if (savedByType) {
      const parsed = JSON.parse(savedByType)
      return {
        stainedGlass: Array.isArray(parsed?.stainedGlass) ? parsed.stainedGlass : [],
        woodwork: Array.isArray(parsed?.woodwork) ? parsed.woodwork : []
      }
    }

    const legacySaved = localStorage.getItem('favoriteCategories')
    const legacyCategories = legacySaved ? JSON.parse(legacySaved) : []
    return {
      stainedGlass: legacyCategories,
      woodwork: []
    }
  })
  const [favoriteMaterialsByType, setFavoriteMaterialsByType] = useState(() => {
    const savedByType = localStorage.getItem('favoriteMaterialsByType')
    if (savedByType) {
      const parsed = JSON.parse(savedByType)
      return {
        stainedGlass: Array.isArray(parsed?.stainedGlass) ? parsed.stainedGlass : [],
        woodwork: Array.isArray(parsed?.woodwork) ? parsed.woodwork : []
      }
    }

    const legacySaved = localStorage.getItem('favoriteMaterials')
    const legacyMaterials = legacySaved ? JSON.parse(legacySaved) : []
    return {
      stainedGlass: legacyMaterials,
      woodwork: []
    }
  })
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
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false)
  const categoryDropdownRef = useRef(null)
  const materialDropdownRef = useRef(null)
  const [categoryInput, setCategoryInput] = useState('')
  const [materialInput, setMaterialInput] = useState('')
  const [imagePreviews, setImagePreviews] = useState([])
  const [enableWatermark, setEnableWatermark] = useState(true)
  const [watermarkText, setWatermarkText] = useState('SGCG ART GLASS')

  const activeFavoriteCategories = favoriteCategoriesByType[productType] || []
  const activeFavoriteMaterials = favoriteMaterialsByType[productType] || []

  const addFavoriteCategoryForActiveType = (value) => {
    setFavoriteCategoriesByType((prev) => {
      const currentValues = prev[productType] || []
      if (currentValues.includes(value)) {
        return prev
      }

      return {
        ...prev,
        [productType]: [...currentValues, value]
      }
    })
  }

  const addFavoriteMaterialForActiveType = (value) => {
    setFavoriteMaterialsByType((prev) => {
      const currentValues = prev[productType] || []
      if (currentValues.includes(value)) {
        return prev
      }

      return {
        ...prev,
        [productType]: [...currentValues, value]
      }
    })
  }

  const removeFavoriteCategoryForActiveType = (value) => {
    setFavoriteCategoriesByType((prev) => ({
      ...prev,
      [productType]: (prev[productType] || []).filter((entry) => entry !== value)
    }))
  }

  const removeFavoriteMaterialForActiveType = (value) => {
    setFavoriteMaterialsByType((prev) => ({
      ...prev,
      [productType]: (prev[productType] || []).filter((entry) => entry !== value)
    }))
  }

  const inferProductType = (product) => {
    const categories = Array.isArray(product?.category)
      ? product.category
      : (product?.category ? [product.category] : [])

    const hasWoodworkCategory = categories.some((entry) => {
      const normalized = String(entry || '').toLowerCase().replace(/\s+/g, '')
      return normalized.includes('woodwork') || normalized.includes('wood')
    })

    return hasWoodworkCategory ? 'woodwork' : 'stainedGlass'
  }

  const isGlassTypeCategory = (value) => {
    const normalized = String(value || '').toLowerCase().replace(/\s+/g, '')
    return normalized === 'stainedglass' || normalized === 'glass'
  }

  const isWoodTypeCategory = (value) => {
    const normalized = String(value || '').toLowerCase().replace(/\s+/g, '')
    return normalized === 'woodwork' || normalized === 'wood' || normalized === 'woodworking'
  }

  const removeTypeCategories = (categories = []) => {
    return categories.filter((entry) => !isGlassTypeCategory(entry) && !isWoodTypeCategory(entry))
  }

  const setPrimaryTypeCategory = (type) => {
    const label = type === 'woodwork' ? WOOD_CATEGORY_LABEL : GLASS_CATEGORY_LABEL
    setManualProduct((prev) => ({
      ...prev,
      category: [label, ...removeTypeCategories(prev.category)]
    }))
  }

  const visibleCategoryTags = removeTypeCategories(manualProduct.category)
  const isGlassChecked = manualProduct.category.some((entry) => isGlassTypeCategory(entry))
  const isWoodChecked = manualProduct.category.some((entry) => isWoodTypeCategory(entry))

  const closeFavoriteDropdowns = () => {
    setShowCategoryDropdown(false)
    setShowMaterialDropdown(false)
  }

  // Close dropdowns when interacting outside
  useEffect(() => {
    const handlePointerDownOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setShowCategoryDropdown(false)
      }
      if (materialDropdownRef.current && !materialDropdownRef.current.contains(event.target)) {
        setShowMaterialDropdown(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeFavoriteDropdowns()
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem('favoriteCategoriesByType', JSON.stringify(favoriteCategoriesByType))
  }, [favoriteCategoriesByType])

  useEffect(() => {
    localStorage.setItem('favoriteMaterialsByType', JSON.stringify(favoriteMaterialsByType))
  }, [favoriteMaterialsByType])

  useEffect(() => {
    localStorage.removeItem('favoriteCategories')
    localStorage.removeItem('favoriteMaterials')
  }, [])

  const applyWatermark = (file, watermarkText, shouldApply) => {
    return new Promise((resolve) => {
      const img = new Image()
      const reader = new FileReader()
      
      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          canvas.width = img.width
          canvas.height = img.height
          
          // Draw the original image
          ctx.drawImage(img, 0, 0)
          
          // Apply watermark if enabled
          if (shouldApply && watermarkText) {
            // Calculate font size based on image size
            const fontSize = Math.max(40, Math.min(img.width, img.height) / 12)
            ctx.font = `bold ${fontSize}px Arial`
            
            // Light grey, see-through color
            ctx.fillStyle = 'rgba(57, 54, 243, 0.5)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            
            // Rotate and position for diagonal watermark (bottom-left to top-right)
            ctx.save()
            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate(-Math.PI / 8) 
            ctx.fillText(watermarkText, 0, 0)
            ctx.restore()
          }
          
          // Convert canvas to blob
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: file.type }))
          }, file.type)
        }
        img.src = e.target.result
      }
      
      reader.readAsDataURL(file)
    })
  }

  const handleAddImages = async (files) => {
    const newPreviews = []
    
    for (const file of Array.from(files)) {
      // Skip watermark for videos
      const isVideo = file.type.startsWith('video')
      let processedFile = file
      
      // Apply watermark to images only
      if (!isVideo) {
        processedFile = await applyWatermark(file, watermarkText, enableWatermark)
      }
      
      const reader = new FileReader()
      reader.onload = (e) => {
        newPreviews.push({
          id: Math.random(),
          src: e.target.result,
          file: processedFile,
          type: isVideo ? 'video' : 'image'
        })
        
        // Only update when all previews are loaded
        if (newPreviews.length === Array.from(files).length) {
          setImagePreviews((prev) => [...prev, ...newPreviews])
          setManualProduct((prev) => ({
            ...prev,
            images: [...(prev.images || []), ...newPreviews.map(p => p.file)]
          }))
        }
      }
      reader.readAsDataURL(processedFile)
    }
  }

  const handleRemoveImage = (id) => {
    // Calculate remaining previews once to avoid stale state issues
    const remainingPreviews = imagePreviews.filter((img) => img.id !== id)
    
    setImagePreviews(remainingPreviews)
    setManualProduct((prev) => {
      // Filter images to keep only those matching remaining previews
      const remainingImages = prev.images.filter((img) => {
        // If it's a File object, check if its preview is in remainingPreviews
        if (img instanceof File) {
          return remainingPreviews.some((preview) => preview.file === img)
        }
        // If it's an existing image object, check by id
        const imgId = `existing-${prev.images.indexOf(img)}`
        return remainingPreviews.some((preview) => preview.id === imgId)
      })
      
      return {
        ...prev,
        images: remainingImages
      }
    })
  }

  const handleManualProductSubmit = async (event) => {
    event.preventDefault()
    setStatus(editingProduct ? 'Updating product...' : 'Adding manual product...')
    try {
      // Convert File objects to data URLs for images
      const processedImages = []
      
      for (const img of manualProduct.images || []) {
        if (img instanceof File) {
          // New file - convert to data URL
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve(e.target.result)
            reader.readAsDataURL(img)
          })
          processedImages.push({
            url: dataUrl,
            type: img.type.startsWith('video') ? 'video' : 'image'
          })
        } else if (img.image_url) {
          // Existing image from database
          processedImages.push({
            image_url: img.image_url,
            media_type: img.media_type || 'image'
          })
        }
      }

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
        images: processedImages
      }

      if (editingProduct) {
        await onUpdateManualProduct(editingProduct.id, productData)
        setStatus('Product updated successfully!')
      } else {
        await onAddManualProduct(productData)
        setStatus('Manual product added successfully!')
      }
      
      // Close modal and reset state
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
      setImagePreviews([])
      setEnableWatermark(true) // Always reset to true after submission
      setWatermarkText('SGCG ART GLASS') // Reset to default text
    } catch (error) {
      // Check if it's an authentication error
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        setStatus('Session expired. Please log out and log back in.')
      } else {
        setStatus(`Error: ${error.message}`)
      }
    }
  }

  const handleEditProduct = (product) => {
    const inferredType = inferProductType(product)
    const existingCategories = Array.isArray(product.category) ? product.category : (product.category ? [product.category] : [])
    const normalizedCategories = [
      inferredType === 'woodwork' ? WOOD_CATEGORY_LABEL : GLASS_CATEGORY_LABEL,
      ...removeTypeCategories(existingCategories)
    ]

    setProductType(inferredType)
    setEditingProduct(product)
    const existingImages = (product.images || []).map((img, idx) => ({
      id: `existing-${idx}`,
      src: img.image_url,
      type: img.media_type === 'video' ? 'video' : 'image',
      isExisting: true
    }))
    setImagePreviews(existingImages)
    setManualProduct({
      name: product.name || '',
      images: product.images || [],
      description: product.description || '',
      category: normalizedCategories,
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
        if (error.message.includes('Unauthorized') || error.message.includes('401')) {
          setStatus('Session expired. Please log out and log back in.')
        } else {
          setStatus(`Error deleting product: ${error.message}`)
        }
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
    setImagePreviews([])
    setEnableWatermark(true) // Always reset to true when modal closes
    setWatermarkText('SGCG ART GLASS') // Reset to default text
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
            <AddEtsyListingForm onAddItem={onAddItem} />

            <div className="panel-section">
              <h3>Add Manual Product</h3>
              <p className="form-note">Add products that are not listed on Etsy</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button 
                  className="button primary" 
                  type="button"
                  onClick={() => {
                    setProductType('stainedGlass')
                    setPrimaryTypeCategory('stainedGlass')
                    setShowManualProductModal(true)
                  }}
                >
                  Add Stained Glass Product
                </button>
                <button 
                  className="button primary" 
                  type="button"
                  onClick={() => {
                    setProductType('woodwork')
                    setPrimaryTypeCategory('woodwork')
                    setShowManualProductModal(true)
                  }}
                >
                  Add Wood Work Product
                </button>
              </div>
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
              <div className="search-box-container">
                <input
                  type="text"
                  placeholder="Search products by name, category, or materials..."
                  value={manualProductSearch}
                  onChange={(e) => setManualProductSearch(e.target.value)}
                  className="search-input"
                />
              </div>
              {(() => {
                const filteredProducts = manualProducts.filter((product) => {
                  const searchLower = manualProductSearch.toLowerCase()
                  const name = toSearchableText(product.name)
                  const description = toSearchableText(product.description)
                  const category = toSearchableText(product.category)
                  const materials = toSearchableText(product.materials)
                  
                  return (
                    name.includes(searchLower) ||
                    description.includes(searchLower) ||
                    category.includes(searchLower) ||
                    materials.includes(searchLower)
                  )
                })

                if (filteredProducts.length === 0 && manualProducts.length === 0) {
                  return <div className="empty-state">No manual products added yet.</div>
                }

                if (filteredProducts.length === 0) {
                  return <div className="empty-state">No products match your search.</div>
                }

                return (
                  <div className="product-list">
                    {filteredProducts.map((product) => (
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
                            {toDisplayList(product.category) && ` · ${toDisplayList(product.category)}`}
                            {toDisplayList(product.materials) && ` · ${toDisplayList(product.materials)}`}
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
                )
              })()}
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

      <div className={`product-form-wrapper product-form-${productType}`}>
        {showManualProductModal && (
          <div className="modal-overlay" onClick={handleCloseModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingProduct ? 'Edit Product' : `Add ${productType === 'stainedGlass' ? 'Stained Glass' : 'Woodwork'} Product`}</h2>
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

                <div className="form-field">
                  <label>Images / Video</label>
                  <div className="image-upload-section">
                    {/* Watermark Settings - At the top */}
                    <div className="watermark-section">
                      <h4>Watermark Settings</h4>
                      <div className="watermark-controls">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={enableWatermark}
                            onChange={(e) => setEnableWatermark(e.target.checked)}
                          />
                          <span>Apply watermark to new images</span>
                        </label>
                        
                        {enableWatermark && (
                          <div className="watermark-input-group">
                            <label>
                              Watermark Text
                              <input
                                type="text"
                                value={watermarkText}
                                onChange={(e) => setWatermarkText(e.target.value)}
                                placeholder="Enter watermark text"
                              />
                            </label>
                            <span className="form-note">
                              Watermark will appear diagonally across the image
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="image-upload-input">
                      <input
                        type="file"
                        id="image-input"
                        accept="image/*,video/*"
                        multiple
                        onChange={(e) => handleAddImages(e.target.files)}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="image-input" className="upload-button">
                        + Add Images/Video
                      </label>
                      <span className="form-note">Click to add multiple images or a video</span>
                    </div>

                    {imagePreviews.length > 0 && (
                      <div className="image-gallery">
                        <h4>Added Images ({imagePreviews.length})</h4>
                        <div className="image-grid">
                          {imagePreviews.map((preview) => (
                            <div 
                              key={preview.id} 
                              className="image-item"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {preview.type === 'video' ? (
                                <video src={preview.src} className="image-preview" />
                              ) : (
                                <img src={preview.src} alt="Preview" className="image-preview" />
                              )}
                              <button
                                type="button"
                                className="remove-image-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemoveImage(preview.id)
                                }}
                                title="Remove image"
                              >
                                ✕
                              </button>
                              {preview.type === 'video' && (
                                <span className="media-badge">Video</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

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
                  Product Type
                  <div className="multi-select-wrapper">
                    <div className="multi-select-inner">
                      <div className="multi-select-row">
                        <label className="checkbox-label" style={{ marginBottom: 0 }}>
                          <input
                            type="checkbox"
                            checked={isGlassChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProductType('stainedGlass')
                                setPrimaryTypeCategory('stainedGlass')
                              }
                            }}
                          />
                          <span>Glass</span>
                        </label>
                        <label className="checkbox-label" style={{ marginBottom: 0 }}>
                          <input
                            type="checkbox"
                            checked={isWoodChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProductType('woodwork')
                                setPrimaryTypeCategory('woodwork')
                              }
                            }}
                          />
                          <span>Wood</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </label>

                <label>
                  Categories
                  <div className="multi-select-wrapper">
                    <div className="multi-select-inner">
                      <div className="multi-select-row">
                        <div className="custom-dropdown-container" ref={categoryDropdownRef}>
                          <button
                            type="button"
                            className="custom-dropdown-trigger"
                            onClick={() => {
                              setShowMaterialDropdown(false)
                              setShowCategoryDropdown((prev) => !prev)
                            }}
                          >
                            Select a favorite category...
                            <span className="dropdown-arrow">▼</span>
                          </button>
                          {showCategoryDropdown && activeFavoriteCategories.length > 0 && (
                            <div className="custom-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                              {activeFavoriteCategories.map((cat) => (
                                <div key={cat} className="custom-dropdown-item">
                                  <button
                                    type="button"
                                    className="dropdown-item-text"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!manualProduct.category.includes(cat)) {
                                        setManualProduct({...manualProduct, category: [...manualProduct.category, cat]})
                                      }
                                      closeFavoriteDropdowns()
                                    }}
                                  >
                                    {cat}
                                  </button>
                                  <button
                                    type="button"
                                    className="dropdown-item-delete"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeFavoriteCategoryForActiveType(cat)
                                    }}
                                    title="Remove from favorites"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="input-button-row">
                          <input
                            id="category-input"
                            name="category-input"
                            type="text"
                            value={categoryInput}
                            onChange={(e) => setCategoryInput(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                if (categoryInput.trim() && !manualProduct.category.includes(categoryInput.trim())) {
                                  setManualProduct({...manualProduct, category: [...manualProduct.category, categoryInput.trim()]})
                                  if (!activeFavoriteCategories.includes(categoryInput.trim())) {
                                    addFavoriteCategoryForActiveType(categoryInput.trim())
                                  }
                                  setCategoryInput('')
                                }
                              }
                            }}
                            placeholder="Type category to add"
                            className="multi-select-input"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (categoryInput.trim() && !manualProduct.category.includes(categoryInput.trim())) {
                                setManualProduct({...manualProduct, category: [...manualProduct.category, categoryInput.trim()]})
                                if (!activeFavoriteCategories.includes(categoryInput.trim())) {
                                  addFavoriteCategoryForActiveType(categoryInput.trim())
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
                      </div>
                      {visibleCategoryTags.length > 0 && (
                        <div className="multi-select-tags">
                          {visibleCategoryTags.map((cat) => (
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
                        <div className="custom-dropdown-container" ref={materialDropdownRef}>
                          <button
                            type="button"
                            className="custom-dropdown-trigger"
                            onClick={() => {
                              setShowCategoryDropdown(false)
                              setShowMaterialDropdown((prev) => !prev)
                            }}
                          >
                            Select a favorite material...
                            <span className="dropdown-arrow">▼</span>
                          </button>
                          {showMaterialDropdown && activeFavoriteMaterials.length > 0 && (
                            <div className="custom-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                              {activeFavoriteMaterials.map((mat) => (
                                <div key={mat} className="custom-dropdown-item">
                                  <button
                                    type="button"
                                    className="dropdown-item-text"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!manualProduct.materials.includes(mat)) {
                                        setManualProduct({...manualProduct, materials: [...manualProduct.materials, mat]})
                                      }
                                      closeFavoriteDropdowns()
                                    }}
                                  >
                                    {mat}
                                  </button>
                                  <button
                                    type="button"
                                    className="dropdown-item-delete"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeFavoriteMaterialForActiveType(mat)
                                    }}
                                    title="Remove from favorites"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="input-button-row">
                          <input
                            id="material-input"
                            name="material-input"
                            type="text"
                            value={materialInput}
                            onChange={(e) => setMaterialInput(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                if (materialInput.trim() && !manualProduct.materials.includes(materialInput.trim())) {
                                  setManualProduct({...manualProduct, materials: [...manualProduct.materials, materialInput.trim()]})
                                  if (!activeFavoriteMaterials.includes(materialInput.trim())) {
                                    addFavoriteMaterialForActiveType(materialInput.trim())
                                  }
                                  setMaterialInput('')
                                }
                              }
                            }}
                            placeholder="Type material to add"
                            className="multi-select-input"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (materialInput.trim() && !manualProduct.materials.includes(materialInput.trim())) {
                                setManualProduct({...manualProduct, materials: [...manualProduct.materials, materialInput.trim()]})
                                if (!activeFavoriteMaterials.includes(materialInput.trim())) {
                                  addFavoriteMaterialForActiveType(materialInput.trim())
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
                      </div>
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
    </div>
  )
}
