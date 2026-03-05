export const resolveWishlistTarget = (product) => {
  const isManual = Boolean(product?.isManual)
  const resolvedProductId = isManual
    ? String(product?.originalData?.id || '').trim()
    : String(product?.id || '').trim()

  if (!resolvedProductId) return null

  return {
    product_type: isManual ? 'manual' : 'etsy',
    product_id: resolvedProductId,
  }
}

export const isWishlistMatch = (item, target) => {
  if (!item || !target) return false
  return (
    String(item.product_type || '') === String(target.product_type || '')
    && String(item.product_id || '') === String(target.product_id || '')
  )
}

export const findWishlistEntry = (favorites, target) =>
  Array.isArray(favorites) ? favorites.find((entry) => isWishlistMatch(entry, target)) : undefined
