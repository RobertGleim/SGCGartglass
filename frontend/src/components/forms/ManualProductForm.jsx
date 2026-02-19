import { useState } from 'react'
import '../../styles/forms/ManualProductForm.css'

export default function ManualProductForm({
  editingProduct,
  manualProduct,
  setManualProduct,
  favoriteCategories,
  setFavoriteCategories,
  favoriteMaterials,
  setFavoriteMaterials,
  onSubmit,
  onClose
}) {
  const [categoryInput, setCategoryInput] = useState('')
  const [materialInput, setMaterialInput] = useState('')
  const [imagePreviews, setImagePreviews] = useState([])
  const [enableWatermark, setEnableWatermark] = useState(true)
  const [watermarkText, setWatermarkText] = useState('SGCG ART GLASS')

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
          
          ctx.drawImage(img, 0, 0)
          
          if (shouldApply && watermarkText) {
            const fontSize = Math.max(40, Math.min(img.width, img.height) / 12)
            ctx.font = `bold ${fontSize}px Arial`
            ctx.fillStyle = 'rgba(57, 54, 243, 0.5)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            
            ctx.save()
            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate(-Math.PI / 8) 
            ctx.fillText(watermarkText, 0, 0)
            ctx.restore()
          }
          
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
      const isVideo = file.type.startsWith('video')
      let processedFile = file
      
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
    const remainingPreviews = imagePreviews.filter((img) => img.id !== id)
    
    setImagePreviews(remainingPreviews)
    setManualProduct((prev) => {
      const remainingImages = prev.images.filter((img) => {
        if (img instanceof File) {
          return remainingPreviews.some((preview) => preview.file === img)
        }
        const imgId = `existing-${prev.images.indexOf(img)}`
        return remainingPreviews.some((preview) => preview.id === imgId)
      })
      
      return {
        ...prev,
        images: remainingImages
      }
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingProduct ? 'Edit Product' : 'Add Manual Product'}</h2>
          <button 
            className="modal-close" 
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
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
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary">
              {editingProduct ? 'Update Product' : 'Add Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
