import './ProductCard.css'

const toCategoryList = (category) => {
  if (Array.isArray(category)) return category
  if (typeof category === 'string' && category.trim().includes(',')) {
    return category
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return category ? [category] : []
}

const normalizeCategory = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const toCleanUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^javascript:/i.test(raw)) return ''

  const unquoted = raw.replace(/^['\"]|['\"]$/g, '')

  if (
    (unquoted.startsWith('[') && unquoted.endsWith(']'))
    || (unquoted.startsWith('{') && unquoted.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(unquoted)
      if (Array.isArray(parsed)) {
        return toCleanUrl(parsed[0]?.image_url || parsed[0]?.url || parsed[0]?.src || parsed[0])
      }
      if (parsed && typeof parsed === 'object') {
        return toCleanUrl(parsed.image_url || parsed.url || parsed.src)
      }
    } catch {
      // Fall back to the original string below.
    }
  }

  if (unquoted.startsWith('data:')) {
    // Browsers reject whitespace inside base64 payloads.
    return unquoted.replace(/\s+/g, '')
  }

  return unquoted
}

const resolveCardImageUrl = (product) => {
  const candidates = [
    product?.image_url,
    product?.thumbnail_url,
    product?.originalData?.images?.[0]?.image_url,
    product?.originalData?.image_url,
  ]

  for (const candidate of candidates) {
    const url = toCleanUrl(candidate)
    if (!url) continue
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('/')) return url
    return `/${url}`
  }

  return ''
}

export default function ProductCard({ product }) {
  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0
  const isDigitalDownload = product.is_digital_download === true
  const isPatternProduct = toCategoryList(product.category)
    .some((entry) => normalizeCategory(entry) === 'patterns' || normalizeCategory(entry) === 'pattern')
  const manualProductId = String(product?.originalData?.id || '').trim()
  const linkedPatternId = String(product?.originalData?.related_links?.pattern_product_id || '').trim()
  const hasLinkedPattern = !isDigitalDownload
    && !isPatternProduct
    && Boolean(linkedPatternId)
    && (!manualProductId || linkedPatternId !== manualProductId)
  const shouldShowInstantDownload = isDigitalDownload || isPatternProduct
  const cardImageUrl = resolveCardImageUrl(product)

  return (
    <a href={`#/product/${product.id}`} className="product-card-link">
      <article className="product-card">
        <div className="card-image">
          {hasDiscount && <span className="sale-badge">On Sale</span>}
          {cardImageUrl ? (
            <img src={cardImageUrl} alt={product.title || 'Glass art'} />
          ) : (
            <div className="image-placeholder">No image</div>
          )}
        </div>
        <div className="card-body">
          <h3 className="card-title">{product.title || 'Untitled piece'}</h3>
          <div className="card-pricing">
            <div className="price-row">
              {hasDiscount ? (
                <>
                  <span className="sale-price">Sale price ${product.price_amount || '0'}</span>
                  <span className="regular-price">(reg ${product.old_price || '0'})</span>
                </>
              ) : (
                <span className="price">
                  ${product.price_amount || '0'}
                </span>
              )}
              {hasDiscount && (
                <>
                  <span className="discount">({discountPercent}% off)</span>
                </>
              )}
            </div>
            {product.free_shipping && (
              <span className="free-shipping">FREE shipping</span>
            )}
            {shouldShowInstantDownload && (
              <span className="instant-download-badge">Instant download</span>
            )}
            {hasLinkedPattern && (
              <span className="pattern-available-badge">Pattern available</span>
            )}
          </div>
        </div>
      </article>
    </a>
  )
}
