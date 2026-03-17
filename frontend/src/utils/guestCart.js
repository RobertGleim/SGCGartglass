const GUEST_CART_KEY = 'sgcg_guest_cart';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeGuestCartEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const productType = String(entry.product_type || '').trim().toLowerCase();
  const productId = String(entry.product_id || '').trim();
  if (!productType || !productId) return null;

  const quantity = Math.max(1, Math.floor(toNumber(entry.quantity) || 1));
  const price = Math.max(0, toNumber(entry.price));
  const title = String(entry.title || 'Item').trim() || 'Item';
  const imageUrl = String(entry.image_url || '').trim();
  const isDigital = Boolean(entry.is_digital);
  const requiresShipping = entry.requires_shipping === undefined ? !isDigital : Boolean(entry.requires_shipping);

  return {
    id: `${productType}:${productId}`,
    product_type: productType,
    product_id: productId,
    title,
    image_url: imageUrl,
    quantity,
    price,
    line_total: Number((price * quantity).toFixed(2)),
    currency: String(entry.currency || 'USD').toUpperCase(),
    is_digital: isDigital,
    requires_shipping: requiresShipping,
  };
};

export const readGuestCart = () => {
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeGuestCartEntry).filter(Boolean);
  } catch {
    return [];
  }
};

export const writeGuestCart = (items) => {
  const normalized = Array.isArray(items)
    ? items.map(normalizeGuestCartEntry).filter(Boolean)
    : [];
  try {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage write failures.
  }
  return normalized;
};

export const addGuestCartItem = (item) => {
  const normalized = normalizeGuestCartEntry(item);
  if (!normalized) return readGuestCart();

  const current = readGuestCart();
  const exists = current.some((entry) => entry.id === normalized.id);
  const next = exists ? current : [normalized, ...current];
  return writeGuestCart(next);
};

export const removeGuestCartItem = (itemId) => {
  const key = String(itemId || '').trim();
  const next = readGuestCart().filter((entry) => entry.id !== key);
  return writeGuestCart(next);
};

export const clearGuestCart = () => writeGuestCart([]);

export const getGuestCartCount = () => {
  return readGuestCart().reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
};
