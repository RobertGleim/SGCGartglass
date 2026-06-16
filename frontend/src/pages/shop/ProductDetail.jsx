import { useState, useEffect, useMemo } from 'react'
import './ProductDetail.css'
import ProductCard from './components/ProductCard'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import { getProductItemNumber, buildDeduplicatedItemNumbers } from '../../utils/itemNumber'
import {
  addCustomerCartItem,
  addCustomerFavorite,
  downloadFreeTemplatePattern,
  fetchCustomerFavorites,
  fetchManualProduct,
  fetchProductReviews,
  getTemplate,
  removeCustomerFavorite,
} from '../../services/api'
import { addGuestCartItem } from '../../utils/guestCart'
import { findWishlistEntry, resolveWishlistTarget } from '../../utils/wishlist'
import { getCurrentUrlKey, navigateTo } from '../../utils/navigation'

const PREVIOUS_ROUTE_KEY = 'sgcg_previous_route'
const PRODUCT_VIEW_CACHE_KEY = 'sgcg_product_view_cache_v1'

const readProductViewCache = () => {
  try {
    const raw = window.sessionStorage.getItem(PRODUCT_VIEW_CACHE_KEY)
    if (!raw) return { manualProducts: {}, templatePreviews: {}, reviews: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { manualProducts: {}, templatePreviews: {}, reviews: {} }
    return {
      manualProducts: parsed.manualProducts && typeof parsed.manualProducts === 'object' ? parsed.manualProducts : {},
      templatePreviews: parsed.templatePreviews && typeof parsed.templatePreviews === 'object' ? parsed.templatePreviews : {},
      reviews: parsed.reviews && typeof parsed.reviews === 'object' ? parsed.reviews : {},
    }
  } catch {
    return { manualProducts: {}, templatePreviews: {}, reviews: {} }
  }
}

const writeProductViewCache = (nextCache) => {
  try {
    window.sessionStorage.setItem(PRODUCT_VIEW_CACHE_KEY, JSON.stringify(nextCache))
  } catch {
    // Ignore storage write failures.
  }
}

const readProductViewCacheEntry = (bucket, key) => {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return null
  const cache = readProductViewCache()
  const source = cache[bucket] && typeof cache[bucket] === 'object' ? cache[bucket] : {}
  return source[normalizedKey] ?? null
}

const writeProductViewCacheEntry = (bucket, key, value) => {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return
  const cache = readProductViewCache()
  const source = cache[bucket] && typeof cache[bucket] === 'object' ? cache[bucket] : {}
  source[normalizedKey] = value
  cache[bucket] = source
  writeProductViewCache(cache)
}

const parseReviewDateValue = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return null

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const localDate = new Date(year, month - 1, day)
    if (!Number.isNaN(localDate.getTime())) return localDate
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const formatReviewDate = (value) => {
  const date = parseReviewDateValue(value)
  if (!date) return ''
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

const extractReviewPurchasedAt = (body) => {
  const lines = String(body || '').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^Purchased At:\s*(.+)$/i)
    if (match) return match[1].trim()
  }
  return ''
}

const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Number(rating) || 0)))

const getApiOrigin = () => {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '/api').trim()
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '')
  }
  return window.location.origin
}

const toCleanUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^javascript:/i.test(url)) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/uploads/')) return `${getApiOrigin()}${url}`
  if (url.startsWith('uploads/')) return `${getApiOrigin()}/${url}`
  return url
}

const hexStringToBytes = (value) => {
  const hex = String(value || '').trim()
  if (!hex || hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16)
  }
  return bytes
}

const normalizeBase64String = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  if (!cleaned || /[^A-Za-z0-9+/=]/.test(cleaned)) return ''

  const paddedLength = Math.ceil(cleaned.length / 4) * 4
  return cleaned.padEnd(paddedLength, '=')
}

const bytesToBase64 = (bytes) => {
  if (!bytes || bytes.length === 0) return ''
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return window.btoa(binary)
}

const mimeTypeFromEntry = (entry) => {
  const mediaType = String(entry?.media_type || '').toLowerCase()
  const imageUrl = String(entry?.image_url || '')
  if (mediaType.startsWith('image/')) return mediaType
  if (mediaType === 'video') return 'video/mp4'
  if (/\.png($|\?)/i.test(imageUrl)) return 'image/png'
  if (/\.webp($|\?)/i.test(imageUrl)) return 'image/webp'
  if (/\.gif($|\?)/i.test(imageUrl)) return 'image/gif'
  if (/\.svg($|\?)/i.test(imageUrl)) return 'image/svg+xml'
  return 'image/jpeg'
}

const imageDataToDataUrl = (entry) => {
  const rawImageData = String(entry?.image_data || '').trim()
  if (!rawImageData) return ''
  if (rawImageData.startsWith('data:')) return rawImageData.replace(/\s+/g, '')

  const mimeType = mimeTypeFromEntry(entry)
  const hexBytes = /^[0-9a-f]+$/i.test(rawImageData) && rawImageData.length % 2 === 0
    ? hexStringToBytes(rawImageData)
    : null

  if (hexBytes && hexBytes.length > 0) {
    const base64 = bytesToBase64(hexBytes)
    return base64 ? `data:${mimeType};base64,${base64}` : ''
  }

  const base64 = normalizeBase64String(rawImageData)
  return base64 ? `data:${mimeType};base64,${base64}` : ''
}

const resolveImageUrl = (entry) => {
  if (!entry) return ''
  if (typeof entry === 'string') return toCleanUrl(entry)

  if (entry.image_data && typeof entry.image_data === 'string') {
    try {
      const dataUrl = imageDataToDataUrl(entry)
      if (dataUrl) return dataUrl
    } catch { /* empty */ }
  }

  const candidates = [
    entry.image_url,
    entry.url,
    entry.src,
    entry.preview_url,
  ]

  for (const candidate of candidates) {
    const normalized = toCleanUrl(candidate)
    if (normalized) return normalized
  }

  return ''
}

const normalizeCategoryValue = (category) => String(category || '').trim().toLowerCase()

const toCategoryArray = (category) => {
  if (Array.isArray(category)) {
    return category.filter(Boolean)
  }

  if (typeof category === 'string') {
    const trimmed = category.trim()
    if (!trimmed) return []

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      } catch { /* empty */ }
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    }

    return [trimmed]
  }

  return category ? [category] : []
}

const isPatternCategory = (category) => {
  const normalized = normalizeCategoryValue(category)
  return normalized === 'pattern' || normalized === 'patterns'
}

const isPatternProductEntry = (entry) =>
  toCategoryArray(entry?.category).some((category) => isPatternCategory(category))

const imageEntryNeedsLinkedTemplateFallback = (entry) => {
  if (!entry || typeof entry !== 'object') return true
  if (entry.image_data) return false
  const imageUrl = String(entry.image_url || '').trim()
  if (!imageUrl) return true
  return imageUrl.startsWith('/uploads/templates/') || imageUrl.startsWith('uploads/templates/')
}

export default function ProductDetail({ product, products = [] }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [showZoom, setShowZoom] = useState(false)
  const [cartStatus, setCartStatus] = useState('')
  const [wishlistStatus, setWishlistStatus] = useState('')
  const [manualProductDetails, setManualProductDetails] = useState(null)
  const [linkedTemplatePreviewUrl, setLinkedTemplatePreviewUrl] = useState('')
  const [linkedTemplateDetails, setLinkedTemplateDetails] = useState(null)
  const [favorites, setFavorites] = useState([])
  const [productReviews, setProductReviews] = useState([])
  const [freeDownloadStatus, setFreeDownloadStatus] = useState('')
  const { customerToken } = useCustomerAuth()

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { send_to: 'AW-18106685600' })
    }
  }, [])

  useEffect(() => {
    const handleClearCache = () => {
      window.sessionStorage.removeItem(PRODUCT_VIEW_CACHE_KEY)
    }

    window.addEventListener('sgcg-clear-product-view-cache', handleClearCache)
    return () => {
      window.removeEventListener('sgcg-clear-product-view-cache', handleClearCache)
    }
  }, [])

  const handleBackNavigation = () => {
    const previousRoute = String(window.sessionStorage.getItem(PREVIOUS_ROUTE_KEY) || '').trim()
    const currentRoute = getCurrentUrlKey()

    const normalizedPrevious = previousRoute.startsWith('#')
      ? previousRoute.slice(1)
      : previousRoute

    const isPreviousProductDetail = normalizedPrevious.startsWith('/product/')

    if (normalizedPrevious && normalizedPrevious !== currentRoute && !isPreviousProductDetail) {
      navigateTo(normalizedPrevious)
      return
    }

    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
      window.history.back()
      return
    }

    navigateTo('/product')
  }

  const wishlistTarget = useMemo(() => resolveWishlistTarget(product), [product])
  const favoriteEntry = useMemo(
    () => findWishlistEntry(favorites, wishlistTarget),
    [favorites, wishlistTarget],
  )
  const isWishlisted = Boolean(favoriteEntry)

  useEffect(() => {
    let isActive = true
    setLinkedTemplatePreviewUrl('')
    setLinkedTemplateDetails(null)

    if (!product?.isManual) {
      return () => {
        isActive = false
      }
    }

    const manualId = String(product.originalData?.id || '').trim()
    if (!manualId) {
      return () => {
        isActive = false
      }
    }

    const cachedManual = readProductViewCacheEntry('manualProducts', manualId)
    if (cachedManual && typeof cachedManual === 'object') {
      setManualProductDetails(cachedManual)
      return () => {
        isActive = false
      }
    }

    setManualProductDetails(null)

    fetchManualProduct(manualId)
      .then((payload) => {
        if (isActive) {
          setManualProductDetails(payload || null)
          if (payload && typeof payload === 'object') {
            writeProductViewCacheEntry('manualProducts', manualId, payload)
          }
        }
      })
      .catch(() => {
        if (isActive) {
          setManualProductDetails(null)
        }
      })

    return () => {
      isActive = false
    }
  }, [product])

  const linkedTemplateId = useMemo(() => {
    const relatedLinks = manualProductDetails?.related_links || product?.originalData?.related_links || product?.related_links
    return String(relatedLinks?.template_id || '').trim()
  }, [manualProductDetails, product])

  useEffect(() => {
    let isActive = true
    setLinkedTemplatePreviewUrl('')

    if (!product?.isManual || !linkedTemplateId) {
      return () => {
        isActive = false
      }
    }

    const cachedTemplatePreview = readProductViewCacheEntry('templatePreviews', linkedTemplateId)
    if (cachedTemplatePreview) {
      setLinkedTemplatePreviewUrl(String(cachedTemplatePreview))
      return () => {
        isActive = false
      }
    }

    getTemplate(linkedTemplateId)
      .then((payload) => {
        if (!isActive) return
        setLinkedTemplateDetails(payload || null)
        const resolved = resolveImageUrl(payload?.thumbnail_url || payload?.image_url || '')
        setLinkedTemplatePreviewUrl(resolved || '')
        if (resolved) {
          writeProductViewCacheEntry('templatePreviews', linkedTemplateId, resolved)
        }
      })
      .catch(() => {
        if (isActive) {
          setLinkedTemplatePreviewUrl('')
          setLinkedTemplateDetails(null)
        }
      })

    return () => {
      isActive = false
    }
  }, [linkedTemplateId, product?.isManual])

  useEffect(() => {
    if (!customerToken) {
      setFavorites([])
      return
    }

    let isActive = true
    fetchCustomerFavorites()
      .then((items) => {
        if (!isActive) return
        setFavorites(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (!isActive) return
        setFavorites([])
      })

    return () => {
      isActive = false
    }
  }, [customerToken])

  useEffect(() => {
    const resolvedProductType = product?.isManual ? 'manual' : 'etsy'
    const resolvedProductId = product?.isManual
      ? String(product?.originalData?.id || '').trim()
      : String(product?.id || '').trim()

    let isActive = true
    const reviewsCacheKey = `${resolvedProductType}:${resolvedProductId}`
    const cachedReviews = readProductViewCacheEntry('reviews', reviewsCacheKey)
    if (Array.isArray(cachedReviews)) {
      setProductReviews(cachedReviews)
      return () => {
        isActive = false
      }
    }

    if (!resolvedProductId) {
      setProductReviews([])
      return () => {
        isActive = false
      }
    }

    fetchProductReviews({ product_type: resolvedProductType, product_id: resolvedProductId })
      .then((response) => {
        if (!isActive) return
        const nextReviews = Array.isArray(response) ? response : []
        setProductReviews(nextReviews)
        writeProductViewCacheEntry('reviews', reviewsCacheKey, nextReviews)
      })
      .catch(() => {
        if (!isActive) return
        setProductReviews([])
      })

    return () => {
      isActive = false
    }
  }, [product])

  const itemReviewSummary = useMemo(() => {
    const total = productReviews.length
    if (total === 0) {
      return {
        total: 0,
        average: 0,
        breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }
    }
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let sum = 0
    productReviews.forEach((review) => {
      const rating = Math.max(1, Math.min(5, Number(review.rating) || 0))
      const bucket = Math.round(rating)
      breakdown[bucket] += 1
      sum += rating
    })
    return {
      total,
      average: sum / total,
      breakdown,
    }
  }, [productReviews])

  const latestProductReview = useMemo(() => {
    if (productReviews.length === 0) return null

    return [...productReviews].sort((a, b) => {
      const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0
      const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0
      return timeB - timeA
    })[0]
  }, [productReviews])

  const latestReviewPhoto = useMemo(() => {
    const imageUrl = String(latestProductReview?.product_image_url || '').trim()
    return imageUrl ? imageUrl : null
  }, [latestProductReview])

  const relatedProducts = useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return []

    const currentId = String(product?.id || '').trim()
    const candidates = products.filter((entry) => String(entry?.id || '').trim() !== currentId)
    if (candidates.length <= 8) return candidates

    const shuffled = [...candidates]
    for (let idx = shuffled.length - 1; idx > 0; idx -= 1) {
      const randomIdx = Math.floor(Math.random() * (idx + 1))
      const temp = shuffled[idx]
      shuffled[idx] = shuffled[randomIdx]
      shuffled[randomIdx] = temp
    }

    return shuffled.slice(0, 8)
  }, [products, product?.id])

  const relatedItemNumberMap = useMemo(
    () => buildDeduplicatedItemNumbers(relatedProducts),
    [relatedProducts]
  )

  // Normalize media records from various API payload shapes and drop invalid URLs.
  const images = useMemo(() => {
    const sourceImages = manualProductDetails?.images?.length > 0
      ? manualProductDetails.images
      : product.originalData?.images?.length > 0
        ? product.originalData.images
        : Array.isArray(product.images) && product.images.length > 0
          ? product.images
          : []

    const shouldPreferLinkedTemplatePreview = Boolean(linkedTemplatePreviewUrl)
      && isPatternProductEntry(manualProductDetails || product?.originalData || product)
      && (sourceImages.length === 0 || imageEntryNeedsLinkedTemplateFallback(sourceImages[0]))

    const candidateImages = shouldPreferLinkedTemplatePreview
      ? [{
          ...(typeof sourceImages[0] === 'object' && sourceImages[0] ? sourceImages[0] : {}),
          image_url: linkedTemplatePreviewUrl,
          media_type: 'image',
        }, ...sourceImages.slice(1)]
      : sourceImages

    const seen = new Set()
    const normalized = candidateImages
      .map((entry) => {
        const mediaType = String(entry?.media_type || '').toLowerCase()
        const isVideo = mediaType === 'video'
        // eslint-disable-next-line no-undef
        const mediaUrl = isVideo ? (resolveVideoUrl(entry) || resolveImageUrl(entry)) : resolveImageUrl(entry)
        if (!mediaUrl) return null

        const key = `${isVideo ? 'video' : 'image'}:${mediaUrl}`
        if (seen.has(key)) return null
        seen.add(key)

        return {
          ...(typeof entry === 'object' && entry ? entry : {}),
          image_url: mediaUrl,
          media_type: isVideo ? 'video' : 'image',
        }
      })
      .filter(Boolean)

    if (normalized.length > 0) {
      return normalized
    }

    const fallback = linkedTemplatePreviewUrl || resolveImageUrl(product.image_url)
    return fallback ? [{ image_url: fallback, media_type: 'image' }] : []
  }, [product, manualProductDetails, linkedTemplatePreviewUrl])

  const mainImage = images.length > 0 ? images[selectedImage]?.image_url || null : null
  const showThumbnails = images.length > 1
  const currentManualProductId = useMemo(
    () => String(product?.originalData?.id || '').trim(),
    [product],
  )

  const relatedLinks = useMemo(() => {
    const directSource = manualProductDetails?.related_links || product?.originalData?.related_links
    if (directSource && typeof directSource === 'object') {
      return directSource
    }
    return null
  }, [manualProductDetails, product])

  const relatedProductFromTemplate = useMemo(() => {
    if (!product?.isManual || !Array.isArray(products)) return null
    const currentId = String(currentManualProductId || '').trim()
    const templateId = String(relatedLinks?.template_id || '').trim()
    if (!currentId || !templateId) return null

    const manualEntries = products
      .filter((entry) => entry?.isManual)
      .map((entry) => entry?.originalData)
      .filter(Boolean)

    return (
      manualEntries.find((entry) => {
        const entryId = String(entry?.id || '').trim()
        if (!entryId || entryId === currentId) return false
        const entryLinks = entry?.related_links
        if (!entryLinks || typeof entryLinks !== 'object') return false
        const entryTemplateId = String(entryLinks.template_id || '').trim()
        if (!entryTemplateId || entryTemplateId !== templateId) return false
        return !isPatternProductEntry(entry)
      }) || null
    )
  }, [currentManualProductId, product, products, relatedLinks?.template_id])

  const resolvedRelatedLinks = useMemo(() => {
    const base = relatedLinks && typeof relatedLinks === 'object' ? { ...relatedLinks } : {}
    const fallback = relatedProductFromTemplate?.related_links

    if (fallback && typeof fallback === 'object') {
      if (!base.template_id && fallback.template_id) base.template_id = fallback.template_id
      if (!base.template_name && fallback.template_name) base.template_name = fallback.template_name
      if (!base.gallery_photo_id && fallback.gallery_photo_id) base.gallery_photo_id = fallback.gallery_photo_id
      if (!base.gallery_panel_name && fallback.gallery_panel_name) base.gallery_panel_name = fallback.gallery_panel_name
      if (!base.gallery_template_id && fallback.gallery_template_id) base.gallery_template_id = fallback.gallery_template_id
    }

    if (!base.pattern_product_id && currentManualProductId && isPatternProductEntry(manualProductDetails || product?.originalData || product)) {
      base.pattern_product_id = currentManualProductId
    }

    return Object.keys(base).length > 0 ? base : null
  }, [currentManualProductId, manualProductDetails, product, relatedLinks, relatedProductFromTemplate])

  const shouldShowPatternLink = useMemo(() => {
    if (!resolvedRelatedLinks?.pattern_product_id) return false
    const patternId = String(resolvedRelatedLinks.pattern_product_id).trim()
    return !currentManualProductId || patternId !== currentManualProductId
  }, [resolvedRelatedLinks, currentManualProductId])

  const relatedProductHref = useMemo(() => {
    const linkedProductId = String(relatedProductFromTemplate?.id || '').trim()
    if (!linkedProductId) return ''
    return `/product/m-${linkedProductId}`
  }, [relatedProductFromTemplate])

  const relatedQuerySuffix = useMemo(() => {
    if (!resolvedRelatedLinks || typeof resolvedRelatedLinks !== 'object') return ''
    const params = new URLSearchParams()
    if (resolvedRelatedLinks.template_id) params.set('template', String(resolvedRelatedLinks.template_id))
    if (resolvedRelatedLinks.pattern_product_id) params.set('pattern_product_id', String(resolvedRelatedLinks.pattern_product_id))
    if (resolvedRelatedLinks.gallery_photo_id) params.set('gallery_photo_id', String(resolvedRelatedLinks.gallery_photo_id))
    if (resolvedRelatedLinks.gallery_template_id) params.set('gallery_template_id', String(resolvedRelatedLinks.gallery_template_id))
    const query = params.toString()
    return query ? `&${query}` : ''
  }, [resolvedRelatedLinks])

  const galleryHref = useMemo(() => {
    if (!resolvedRelatedLinks?.gallery_photo_id) return ''
    const params = new URLSearchParams()
    params.set('photo_id', String(resolvedRelatedLinks.gallery_photo_id))
    const templateId = resolvedRelatedLinks.gallery_template_id || resolvedRelatedLinks.template_id
    if (templateId) params.set('template_id', String(templateId))
    if (resolvedRelatedLinks.pattern_product_id) params.set('pattern_product_id', String(resolvedRelatedLinks.pattern_product_id))
    if (resolvedRelatedLinks.template_id) params.set('template', String(resolvedRelatedLinks.template_id))
    const query = params.toString()
    return query ? `/gallery?${query}` : '/gallery'
  }, [resolvedRelatedLinks])

  useEffect(() => {
    if (images.length === 0) {
      setSelectedImage(0)
      return
    }

    if (selectedImage >= images.length) {
      setSelectedImage(0)
    }
  }, [images.length, selectedImage])
  
  const handleAddToCart = async () => {
    setCartStatus('')
    if (isSoldOut) {
      setCartStatus('This item is sold out.')
      return
    }

    const isManual = Boolean(product.isManual)
    const resolvedProductId = isManual
      ? String(product.originalData?.id || '').trim()
      : String(product.id || '').trim()

    if (!resolvedProductId) {
      setCartStatus('Unable to add this product right now.')
      return
    }

    const guestCartItem = {
      product_type: isManual ? 'manual' : 'etsy',
      product_id: resolvedProductId,
      quantity: 1,
      title: product.title || product.originalData?.name || 'Product',
      image_url: mainImage || '',
      price: Number(product.price_amount || 0),
      currency: 'USD',
      is_digital: isManual && (manualProductDetails?.is_digital_download || product.originalData?.is_digital_download),
      requires_shipping: !(isManual && (manualProductDetails?.is_digital_download || product.originalData?.is_digital_download)),
    }

    if (!customerToken) {
      addGuestCartItem(guestCartItem)
      window.dispatchEvent(new Event('cart-updated'))
      setCartStatus('Added to cart.')
      return
    }

    try {
      await addCustomerCartItem({
        product_type: isManual ? 'manual' : 'etsy',
        product_id: resolvedProductId,
        quantity: 1,
      })
      setCartStatus('Added to cart.')
      window.dispatchEvent(new Event('cart-updated'))
    } catch (error) {
      setCartStatus(error?.response?.data?.error || error.message || 'Unable to add to cart.')
    }
  }

  const handleDownloadFreePattern = async () => {
    setFreeDownloadStatus('')

    if (!linkedTemplateId) {
      setFreeDownloadStatus('No linked template was found for this product.')
      return
    }

    if (!customerToken) {
      setFreeDownloadStatus('Sign in to download free patterns.')
      navigateTo('/account/login')
      return
    }

    try {
      const blobPayload = await downloadFreeTemplatePattern(linkedTemplateId)
      const blob = blobPayload instanceof Blob ? blobPayload : new Blob([blobPayload])
      const mime = String(blob.type || '').toLowerCase()
      const extension = mime.includes('svg')
        ? '.svg'
        : mime.includes('png')
          ? '.png'
          : mime.includes('jpeg') || mime.includes('jpg')
            ? '.jpg'
            : '.bin'

      const safeName = String(linkedTemplateDetails?.name || `template-${linkedTemplateId}`)
        .trim()
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      const fileName = `${safeName || `template-${linkedTemplateId}`}${extension}`

      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)

      setFreeDownloadStatus('Free pattern download started.')
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.error || error?.message || 'Download failed.'
      setFreeDownloadStatus(String(detail))
    }
  }

  const isDigitalDownload = Boolean(product.is_digital_download)
  const isDigitalPatternListing = isDigitalDownload && isPatternProductEntry(manualProductDetails || product?.originalData || product)
  const canDownloadFreeTemplate = Boolean(linkedTemplateId) && Boolean(linkedTemplateDetails?.is_free)
  const primaryPriceLabel = isDigitalDownload ? 'Digital Price' : 'Price'
  const availableQuantity = Number(manualProductDetails?.quantity ?? product.originalData?.quantity)
  const hasManualQuantity = Boolean(product.isManual) && Number.isFinite(availableQuantity)
  const isSoldOut = Boolean(product.isManual) && !isDigitalDownload && Number.isFinite(availableQuantity) && availableQuantity <= 0

  const handleAddToWishlist = async () => {
    setWishlistStatus('')
    if (!customerToken) {
      setWishlistStatus('Sign in to save items to your wishlist.')
      navigateTo('/account/login')
      return
    }

    if (!wishlistTarget) {
      setWishlistStatus('Unable to save this item right now.')
      return
    }

    if (isWishlisted) {
      setWishlistStatus('Already in your wishlist.')
      return
    }

    try {
      await addCustomerFavorite(wishlistTarget)
      setFavorites((prev) => [{ ...wishlistTarget, id: `temp-${Date.now()}` }, ...prev])
      setWishlistStatus('Added to wishlist.')
      window.dispatchEvent(new Event('wishlist-updated'))
    } catch (error) {
      setWishlistStatus(error?.response?.data?.error || error.message || 'Unable to add to wishlist.')
    }
  }

  const handleToggleFavorite = async () => {
    setWishlistStatus('')
    if (!customerToken) {
      setWishlistStatus('Sign in to save items to your wishlist.')
      navigateTo('/account/login')
      return
    }

    if (!wishlistTarget) {
      setWishlistStatus('Unable to save this item right now.')
      return
    }

    try {
      if (isWishlisted) {
        if (favoriteEntry?.id) {
          await removeCustomerFavorite(favoriteEntry.id)
          setFavorites((prev) => prev.filter((entry) => entry.id !== favoriteEntry.id))
        } else {
          setFavorites((prev) => prev.filter((entry) => !findWishlistEntry([entry], wishlistTarget)))
        }
        setWishlistStatus('Removed from wishlist.')
      } else {
        await addCustomerFavorite(wishlistTarget)
        setFavorites((prev) => [{ ...wishlistTarget, id: `temp-${Date.now()}` }, ...prev])
        setWishlistStatus('Added to wishlist.')
      }
      window.dispatchEvent(new Event('wishlist-updated'))
    } catch (error) {
      setWishlistStatus(error?.response?.data?.error || error.message || 'Unable to update wishlist.')
    }
  }

  // Handle keyboard navigation in zoom mode
  useEffect(() => {
    if (!showZoom) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowZoom(false)
      } else if (e.key === 'ArrowLeft') {
        setSelectedImage((prev) => (prev > 0 ? prev - 1 : images.length - 1))
      } else if (e.key === 'ArrowRight') {
        setSelectedImage((prev) => (prev < images.length - 1 ? prev + 1 : 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showZoom, images.length])

  const handlePrevImage = () => {
    setSelectedImage((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNextImage = () => {
    setSelectedImage((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0

  return (
    <div className="product-detail">
      <div className="product-detail-content">
        <div className="product-detail-back-row">
          <button type="button" className="product-detail-back-button" onClick={handleBackNavigation}>
            <span className="product-detail-back-icon" aria-hidden="true">←</span>
            <span>Back</span>
          </button>
        </div>

        <div className="product-detail-container">

        {/* Product Images Section */}
        <div className="product-images-section">
          {/* Image thumbnails on the left (if multiple images exist) */}
          {showThumbnails && (
            <div className="image-thumbnails">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  className={`thumbnail ${idx === selectedImage ? 'active' : ''}`}
                  onClick={() => setSelectedImage(idx)}
                >
                  {img.media_type === 'video' ? (
                    <video src={img.image_url} muted playsInline className="thumbnail-video" preload="metadata" />
                  ) : (
                    <img src={img.image_url} alt={`${product.title} ${idx + 1}`} loading="lazy" decoding="async" fetchPriority="low" />
                  )}
                </button>
              ))}
            </div>
          )}
          
          <div className="main-image-panel">
            {/* Main image on the right */}
            <div 
              className={`main-image-container ${showThumbnails ? 'with-thumbnails' : 'single-image'}`}
              onClick={() => setShowZoom(true)}
              style={{ cursor: 'zoom-in' }}
            >
              {mainImage ? (
                images[selectedImage]?.media_type === 'video' ? (
                  <video src={mainImage} controls className="main-image" preload="metadata" />
                ) : (
                  <img src={mainImage} alt={product.title} className="main-image" loading="eager" decoding="async" fetchPriority="high" />
                )
              ) : (
                <div className="image-placeholder">No image available</div>
              )}
            </div>
            {isDigitalPatternListing && mainImage && (
              <p className="pattern-image-note">
                This is a digital pattern only. All other photos are for references.
              </p>
            )}
          </div>
        </div>

        {/* Product Info Section */}
        <div className="product-info-section">
          {/* Shop info */}
          <div className="shop-info">
            <a href="/product" className="shop-link">SGCG Art Glass</a>
            <span className="separator">•</span>
            <a href="/product" className="reviews-link">Excellent (2.8k reviews)</a>
          </div>

          {/* Title */}
          <h1 className="product-title">{product.title || 'Product title'}</h1>

          {/* Pricing Section */}
          <div className="pricing-section">
            <div className="price-info">
              <span className="current-price">{primaryPriceLabel} ${product.price_amount || '0'}</span>
              {hasDiscount && (
                <>
                  <span className="old-price">${product.old_price}</span>
                  <span className="discount-badge">{discountPercent}% off</span>
                </>
              )}
              {isSoldOut && (
                <span className="sold-out-pill">Sold out</span>
              )}
            </div>
            {product.price_currency && product.price_currency !== 'USD' && (
              <div className="currency-note">Prices shown in USD</div>
            )}
            {getProductItemNumber(product) && (
              <div className="detail-item-number">Item #: {getProductItemNumber(product)}</div>
            )}
          </div>

          {/* Product Description */}
          <div className="description-section">
            <h3>Description</h3>
            <p>{product.description || 'No description available'}</p>
          </div>

          {hasManualQuantity && (
            <div className="quantity-section">
              <h3>Quantity in stock</h3>
              {isSoldOut ? (
                <p className="out-of-stock-contact">Product out of stock please contact SGCG Art if you like to order this product</p>
              ) : (
                <p>{Math.max(0, Math.trunc(availableQuantity))}</p>
              )}
              <p className="quantity-note">
                All panels are made to order; quantity in stock reflects how many panels can be made with thematerials on hand.
              </p>
            </div>
          )}

          {/* Product Tags */}
          {toCategoryArray(product.category).length > 0 && (
            <div className="tags-section">
              <h3>Tags</h3>
              <div className="tags-list">
                {toCategoryArray(product.category).map((tag) => (
                  <span key={tag} className="tag-badge">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Product Details */}
          <div className="details-section">
            <h3>Details</h3>
            <ul>
              {product.created_at && (
                <li>
                  <strong>Listed:</strong> {new Date(product.created_at).toLocaleDateString()}
                </li>
              )}
              {product.is_featured && (
                <li>
                  <strong>Status:</strong> Featured item
                </li>
              )}
              {product.free_shipping && (
                <li>
                  <strong>Shipping:</strong> Free shipping available
                </li>
              )}
              {isDigitalDownload && (
                <li>
                  <strong>Delivery:</strong> Instant digital download after Stripe payment confirmation
                </li>
              )}
            </ul>
          </div>

          {!!resolvedRelatedLinks && (
            <div className="related-links-section">
              <h3>Design Resources</h3>
              <ul>
                {resolvedRelatedLinks.template_id && (
                  <li>
                    <a href={`/designer?template=${resolvedRelatedLinks.template_id}${relatedQuerySuffix}`}>
                      View linked template{resolvedRelatedLinks.template_name ? `: ${resolvedRelatedLinks.template_name}` : ''}
                    </a>
                  </li>
                )}
                {relatedProductHref && (
                  <li>
                    <a href={`${relatedProductHref}${relatedQuerySuffix ? `?${relatedQuerySuffix.slice(1)}` : ''}`}>
                      View related product{relatedProductFromTemplate?.name ? `: ${relatedProductFromTemplate.name}` : ''}
                    </a>
                  </li>
                )}
                {shouldShowPatternLink && (
                  <li>
                    <a href={`/product/m-${resolvedRelatedLinks.pattern_product_id}${relatedQuerySuffix ? `?${relatedQuerySuffix.slice(1)}` : ''}`}>
                      View related pattern{resolvedRelatedLinks.pattern_product_name ? `: ${resolvedRelatedLinks.pattern_product_name}` : ''}
                    </a>
                  </li>
                )}
                {resolvedRelatedLinks.gallery_photo_id && (
                  <li>
                    <a href={galleryHref || '/gallery'}>
                      View photo gallery example{resolvedRelatedLinks.gallery_panel_name ? `: ${resolvedRelatedLinks.gallery_panel_name}` : ''}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Quantity & Add to Cart */}
          <div className="purchase-section">
            
            <button className="add-to-cart-btn" onClick={handleAddToCart} disabled={isSoldOut}>
              {isSoldOut ? 'Sold out' : isDigitalDownload ? 'Buy digital download' : 'Add to cart'}
            </button>
            {canDownloadFreeTemplate && (
              <button className="add-to-cart-btn" onClick={handleDownloadFreePattern}>
                Download free pattern
              </button>
            )}
            <button className="wishlist-btn" onClick={handleAddToWishlist}>
              {isWishlisted ? 'In wishlist' : 'Add to wishlist'}
            </button>
            <button
              className={`favorite-btn ${isWishlisted ? 'active' : ''}`}
              onClick={handleToggleFavorite}
              title={isWishlisted ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={isWishlisted ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isWishlisted}
            >
              {isWishlisted ? '♥' : '♡'}
            </button>
          </div>
          {cartStatus && <p className="currency-note">{cartStatus}</p>}
          {wishlistStatus && <p className="currency-note">{wishlistStatus}</p>}
          {freeDownloadStatus && <p className="currency-note">{freeDownloadStatus}</p>}

          {/* Shop Policies */}
          <div className="shop-policies">
            <h3>Shop policies</h3>
            <div className="policy-item">
              <span className="policy-icon">📦</span>
              <div>
                <strong>Free shipping in USA</strong>
                <p>Ships from United States</p>
              </div>
            </div>
            <div className="policy-item">
              <span className="policy-icon">↩️</span>
              <div>
                <strong>30-day returns</strong>
                <p>Buyers are responsible for return shipping</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Related Products Section */}
      <div className="related-section">
        <h2>Reviews for this item ({itemReviewSummary.total})</h2>
        {itemReviewSummary.total === 0 ? (
          <p className="related-placeholder">No reviews for this item yet.</p>
        ) : (
          <>
            <section className="detail-review-summary-card">
              <div className="detail-review-summary-average-wrap">
                <p className="detail-review-summary-average">{itemReviewSummary.average.toFixed(1)}/5</p>
                <p className="detail-review-summary-count">item average</p>
              </div>
              <div className="detail-review-summary-breakdown">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = itemReviewSummary.breakdown[star]
                  const percentage = itemReviewSummary.total > 0
                    ? Math.round((count / itemReviewSummary.total) * 100)
                    : 0
                  return (
                    <div key={star} className="detail-review-breakdown-row">
                      <span>{star} star</span>
                      <div className="detail-review-breakdown-bar">
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <span>{percentage}%</span>
                    </div>
                  )
                })}
              </div>
            </section>

            {latestProductReview ? (
              <div className="detail-review-list">
                <article key={latestProductReview.id} className="detail-review-list-card">
                  <div className="detail-review-list-head">
                    <p className="detail-review-stars">{renderStars(latestProductReview.rating)} <span>{Number(latestProductReview.rating || 0)}/5</span></p>
                    {(Number(latestProductReview.rating) || 0) >= 4 ? <p className="detail-review-recommends">✓ Recommends</p> : null}
                  </div>
                  <div className="detail-review-list-meta">
                    <strong>{(latestProductReview.first_name || '').trim()} {(latestProductReview.last_name || '').trim()}</strong>
                    {extractReviewPurchasedAt(latestProductReview.body) ? <span>{formatReviewDate(extractReviewPurchasedAt(latestProductReview.body))}</span> : null}
                  </div>
                  <div className="detail-review-list-body-row">
                    <div>
                      <p className="detail-review-title">{latestProductReview.title || 'Customer review'}</p>
                      <p className="detail-review-body">{latestProductReview.body || ''}</p>
                    </div>
                    {latestProductReview.product_image_url ? (
                      <img
                        src={latestProductReview.product_image_url}
                        alt={latestProductReview.product_title || latestProductReview.title || 'Reviewed item'}
                        className="detail-review-inline-image"
                      />
                    ) : null}
                  </div>
                </article>
              </div>
            ) : null}

            {latestReviewPhoto ? (
              <section className="detail-review-photos-section">
                <h3>Photos from reviews</h3>
                <div className="detail-review-photos-strip">
                  <img
                    src={latestReviewPhoto}
                    alt={latestProductReview?.product_title || latestProductReview?.title || 'Review photo'}
                  />
                </div>
              </section>
            ) : null}
          </>
        )}
        <h2>More from this shop</h2>
        {relatedProducts.length === 0 ? (
          <p className="related-placeholder">No related products available right now.</p>
        ) : (
          <div className="related-products-grid" aria-label="More items from this shop">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={`related-${relatedProduct.id}`} product={relatedProduct} itemNumber={relatedItemNumberMap.get(relatedProduct.id) ?? ''} />
            ))}
          </div>
        )}
      </div>

      {/* Image Zoom Modal */}
      {showZoom && (
        <div className="zoom-modal">
          <button className="zoom-close" onClick={() => setShowZoom(false)}>
            ×
          </button>

          {/* Main zoomed image */}
          <div className="zoom-content" onClick={(e) => e.stopPropagation()}>
            <div className="zoom-main-image">
              {mainImage && (
                images[selectedImage].media_type === 'video' ? (
                  <video src={mainImage} controls className="zoomed-image" />
                ) : (
                  <img src={mainImage} alt={product.title} className="zoomed-image" />
                )
              )}
            </div>

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <button className="zoom-arrow zoom-arrow-left" onClick={handlePrevImage}>
                  ‹
                </button>
                <button className="zoom-arrow zoom-arrow-right" onClick={handleNextImage}>
                  ›
                </button>
              </>
            )}
          </div>

          {/* Thumbnail strip on the right */}
          {images.length > 1 && (
            <div className="zoom-thumbnails">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  className={`zoom-thumbnail ${idx === selectedImage ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedImage(idx)
                  }}
                >
                  {img.media_type === 'video' ? (
                    <video src={img.image_url} className="zoom-thumb-image" />
                  ) : (
                    <img src={img.image_url} alt={`Thumbnail ${idx + 1}`} className="zoom-thumb-image" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
