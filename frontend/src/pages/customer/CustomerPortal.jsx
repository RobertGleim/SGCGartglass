import { useEffect, useMemo, useState } from 'react'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import '../../styles/CustomerPortal.css'
import {
  fetchCustomerProfile,
  fetchCustomerAddresses,
  updateCustomerProfile,
  upsertCustomerPrimaryAddress,
  changeCustomerPassword,
  fetchCustomerFavorites,
  addCustomerFavorite,
  removeCustomerFavorite,
  fetchCustomerCart,
  updateCustomerCartItem,
  removeCustomerCartItem,
  fetchCustomerOrders,
  fetchCustomerOrderItems,
  fetchCustomerReviews,
  fetchCustomerReviewOptions,
  createCustomerReview,
  updateCustomerReview,
  getCustomerInvoices,
  getCustomerInvoice,
  addInvoiceToCart,
  deleteCustomerInvoice,
} from '../../services/api'
import { findWishlistEntry } from '../../utils/wishlist'

const TABS = ['overview', 'orders', 'favorites', 'cart', 'reviews', 'settings', 'work_orders']

const TAB_LABELS = {
  overview: 'overview',
  orders: 'orders',
  favorites: 'wishlist',
  cart: 'cart',
  reviews: 'reviews',
  settings: 'settings',
  work_orders: 'customer work order',
}

const SINGLE_ITEM_WARNING = 'Items are sold per piece. Please contact customer service if you need more than one of the same item.'
const STAR_SCALE = [1, 2, 3, 4, 5]
const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Math.round(Number(rating) || 0))))

export default function CustomerPortal({ manualProducts }) {
  const { customerToken, logout } = useCustomerAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [favorites, setFavorites] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState({})
  const [invoices, setInvoices] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [invoiceViewLoading, setInvoiceViewLoading] = useState(false)
  const [invoiceViewLoadingId, setInvoiceViewLoadingId] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewOptions, setReviewOptions] = useState([])
  const [status, setStatus] = useState('')
  const [settingsTab, setSettingsTab] = useState('profile')
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })
  const [addressForm, setAddressForm] = useState({
    label: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [reviewForm, setReviewForm] = useState({
    review_id: null,
    review_key: '',
    rating: 5,
    title: '',
    body: '',
  })

  const manualProductMap = useMemo(() => {
    const map = new Map()
    manualProducts.forEach((product) => {
      map.set(String(product.id), product)
    })
    return map
  }, [manualProducts])

  useEffect(() => {
    if (!customerToken) {
      return
    }

    let isActive = true
    const loadData = async () => {
      try {
        const [profileData, addressData, favoriteData, cartData, orderData, invoiceData, reviewData, reviewOptionData] =
          await Promise.all([
            fetchCustomerProfile(),
            fetchCustomerAddresses(),
            fetchCustomerFavorites(),
            fetchCustomerCart(),
            fetchCustomerOrders(),
            getCustomerInvoices('open'),
            fetchCustomerReviews(),
            fetchCustomerReviewOptions(),
          ])

        if (!isActive) return
        setProfile(profileData)
        setProfileForm({
          first_name: profileData?.first_name || '',
          last_name: profileData?.last_name || '',
          email: profileData?.email || '',
          phone: profileData?.phone || '',
        })
        setAddresses(Array.isArray(addressData) ? addressData : [])
        const primaryAddress =
          (Array.isArray(addressData) ? addressData.find((entry) => entry.is_default) : null)
          || (Array.isArray(addressData) ? addressData[0] : null)
          || {}
        setAddressForm({
          label: primaryAddress.label || 'Primary',
          line1: primaryAddress.line1 || '',
          line2: primaryAddress.line2 || '',
          city: primaryAddress.city || '',
          state: primaryAddress.state || '',
          postal_code: primaryAddress.postal_code || '',
          country: primaryAddress.country || '',
        })
        setFavorites(Array.isArray(favoriteData) ? favoriteData : [])
        setCartItems(Array.isArray(cartData) ? cartData : [])
        setOrders(Array.isArray(orderData) ? orderData : [])
        setInvoices(Array.isArray(invoiceData) ? invoiceData : [])
        setReviews(Array.isArray(reviewData) ? reviewData : [])
        const normalizedReviewOptions = Array.isArray(reviewOptionData) ? reviewOptionData : []
        setReviewOptions(normalizedReviewOptions)
        setReviewForm((prev) => ({
          ...prev,
          review_key: prev.review_key || (normalizedReviewOptions[0]
            ? `${normalizedReviewOptions[0].product_type}:${normalizedReviewOptions[0].product_id}`
            : ''),
        }))

        const ordersArr = Array.isArray(orderData) ? orderData : []
        const itemsByOrder = {}
        await Promise.all(
          ordersArr.map(async (order) => {
            const items = await fetchCustomerOrderItems(order.id)
            itemsByOrder[order.id] = items
          })
        )
        if (isActive) {
          setOrderItems(itemsByOrder)
        }
      } catch (error) {
        setStatus(error.message || 'Unable to load account data.')
      }
    }

    loadData()
    return () => {
      isActive = false
    }
  }, [customerToken])

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setStatus('')
    try {
      const updated = await updateCustomerProfile({
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        phone: profileForm.phone,
      })
      setProfile(updated)
      setProfileForm((prev) => ({
        ...prev,
        first_name: updated?.first_name || '',
        last_name: updated?.last_name || '',
        email: updated?.email || prev.email,
        phone: updated?.phone || '',
      }))
      setStatus('Profile updated.')
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to save profile.')
    }
  }

  const handleAddressSubmit = async (event) => {
    event.preventDefault()
    setStatus('')
    try {
      await upsertCustomerPrimaryAddress(addressForm)
      const refreshedAddresses = await fetchCustomerAddresses()
      const normalized = Array.isArray(refreshedAddresses) ? refreshedAddresses : []
      setAddresses(normalized)
      const primaryAddress = normalized.find((entry) => entry.is_default) || normalized[0] || {}
      setAddressForm({
        label: primaryAddress.label || 'Primary',
        line1: primaryAddress.line1 || '',
        line2: primaryAddress.line2 || '',
        city: primaryAddress.city || '',
        state: primaryAddress.state || '',
        postal_code: primaryAddress.postal_code || '',
        country: primaryAddress.country || '',
      })
      setStatus('Address updated.')
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to save address.')
    }
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setStatus('')
    if (!passwordForm.old_password || !passwordForm.new_password) {
      setStatus('Enter your current and new password.')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setStatus('New password and confirmation must match.')
      return
    }
    try {
      await changeCustomerPassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      })
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' })
      setStatus('Password updated.')
    } catch (error) {
      const code = error?.response?.data?.error
      if (code === 'invalid_old_password') {
        setStatus('Current password is incorrect.')
      } else if (code === 'password_too_short') {
        setStatus('New password must be at least 8 characters.')
      } else {
        setStatus(code || error.message || 'Unable to update password.')
      }
    }
  }

  const handleRemoveFavorite = async (favoriteId) => {
    await removeCustomerFavorite(favoriteId)
    setFavorites((prev) => prev.filter((item) => item.id !== favoriteId))
  }

  const handleUpdateCartQuantity = async (itemId, quantity) => {
    if (Number(quantity) > 1) {
      setStatus(SINGLE_ITEM_WARNING)
      return
    }
    try {
      await updateCustomerCartItem(itemId, { quantity: 1 })
      setCartItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, quantity: 1 } : item))
      )
    } catch (error) {
      const apiError = error?.response?.data?.error
      if (apiError === 'single_item_limit') {
        setStatus(SINGLE_ITEM_WARNING)
      } else {
        setStatus(error?.response?.data?.message || apiError || error.message || 'Unable to update cart quantity.')
      }
    }
  }

  const handleRemoveCartItem = async (itemId) => {
    await removeCustomerCartItem(itemId)
    setCartItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const handleMoveCartItemToWishlist = async (item) => {
    setStatus('')
    const payload = {
      product_type: item?.product_type,
      product_id: String(item?.product_id || ''),
    }

    if (!payload.product_type || !payload.product_id) {
      setStatus('Unable to move this cart item to wishlist.')
      return
    }

    try {
      const existing = findWishlistEntry(favorites, payload)
      if (!existing) {
        await addCustomerFavorite(payload)
        setFavorites((prev) => [{ ...payload, id: `temp-${Date.now()}` }, ...prev])
      }

      await removeCustomerCartItem(item.id)
      setCartItems((prev) => prev.filter((entry) => entry.id !== item.id))
      window.dispatchEvent(new Event('cart-updated'))
      window.dispatchEvent(new Event('wishlist-updated'))
      setStatus('Moved item to wishlist.')
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to move item to wishlist.')
    }
  }

  const handleSubmitReview = async (event) => {
    event.preventDefault()
    setStatus('')

    try {
      if (reviewForm.review_id) {
        const updatePayload = {
          rating: Number(reviewForm.rating),
          title: reviewForm.title,
          body: reviewForm.body,
        }
        await updateCustomerReview(reviewForm.review_id, updatePayload)
        setReviews((prev) => prev.map((entry) => (
          entry.id === reviewForm.review_id
            ? { ...entry, ...updatePayload, status: 'pending' }
            : entry
        )))
        setStatus('Review updated. It is pending approval.')
      } else {
        const selectedOption = reviewOptions.find(
          (entry) => `${entry.product_type}:${entry.product_id}` === reviewForm.review_key,
        )
        if (!selectedOption) {
          setStatus('Select a purchased item to review.')
          return
        }

        const payload = {
          product_type: selectedOption.product_type,
          product_id: String(selectedOption.product_id),
          rating: Number(reviewForm.rating),
          title: reviewForm.title,
          body: reviewForm.body,
        }
        const response = await createCustomerReview(payload)
        setReviews((prev) => [
          {
            id: response.id,
            ...payload,
            status: 'pending',
          },
          ...prev,
        ])
        setStatus('Review submitted.')
      }

      setReviewForm({
        review_id: null,
        review_key: reviewForm.review_key,
        rating: 5,
        title: '',
        body: '',
      })
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to submit review.')
    }
  }

  const handleStartEditReview = (review) => {
    setReviewForm({
      review_id: review.id,
      review_key: `${review.product_type}:${review.product_id}`,
      rating: Number(review.rating) || 5,
      title: review.title || '',
      body: review.body || '',
    })
    setStatus('Editing review. Save to apply changes.')
  }

  const handleCancelEditReview = () => {
    setReviewForm((prev) => ({
      review_id: null,
      review_key: prev.review_key,
      rating: 5,
      title: '',
      body: '',
    }))
    setStatus('')
  }

  const handleAddInvoiceToCart = async (invoiceId) => {
    setStatus('')
    try {
      await addInvoiceToCart(invoiceId)
      setStatus('Invoice added to cart.')
      window.dispatchEvent(new Event('cart-updated'))
    } catch (error) {
      setStatus(error?.response?.data?.message || error?.response?.data?.error || error.message || 'Unable to add invoice to cart.')
    }
  }

  const handleDeleteInvoice = async (invoiceId) => {
    setStatus('')
    try {
      await deleteCustomerInvoice(invoiceId)
      setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId))
      setStatus('Invoice removed from your list.')
    } catch (error) {
      setStatus(error?.response?.data?.message || error?.response?.data?.error || error.message || 'Unable to remove invoice.')
    }
  }

  const handleViewInvoice = async (invoiceId) => {
    setStatus('')
    setInvoiceViewLoading(true)
    setInvoiceViewLoadingId(invoiceId)
    try {
      const response = await getCustomerInvoice(invoiceId)
      const invoice = response?.data || response || null
      if (!invoice) {
        setStatus('Unable to load invoice details.')
        return
      }
      setSelectedInvoice(invoice)
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to load invoice details.')
    } finally {
      setInvoiceViewLoading(false)
      setInvoiceViewLoadingId(null)
    }
  }

  const renderReviewOptionLabel = (item) => {
    const fallbackLabel = renderProductLabel(item?.product_type, item?.product_id)
    const title = String(item?.title || '').trim()
    return title || fallbackLabel || `${item?.product_type || 'product'} #${item?.product_id || ''}`
  }

  const renderProductLabel = (productType, productId) => {
    if (productType === 'invoice') {
      const raw = String(productId || '').trim()
      const idPart = raw.toLowerCase().startsWith('inv-') ? raw.slice(4) : raw
      return idPart ? `Invoice #${idPart}` : 'Invoice'
    }
    if (productType === 'manual') {
      const product = manualProductMap.get(String(productId))
      return product ? product.name : `Manual product #${productId}`
    }
    return `Etsy item #${productId}`
  }

  const handleViewWishlistItem = (item) => {
    const rawProductId = String(item?.product_id || '').trim()
    if (!rawProductId) {
      window.location.hash = '#/product'
      return
    }

    const routeProductId = item?.product_type === 'manual'
      ? `m-${rawProductId}`
      : rawProductId

    window.location.hash = `#/product/${routeProductId}`
  }

  return (
    <div className="customer-portal">
      <div className="customer-portal-header">
        <div>
          <h2>Customer portal</h2>
          <p>Manage your account, track orders, and keep tabs on your wishlist.</p>
        </div>
        <button className="secondary portal-signout" onClick={logout}>Sign out</button>
      </div>

      {status && <div className="customer-auth-error">{status}</div>}

      <div className="portal-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${tab === activeTab ? 'active' : ''} ${tab === 'work_orders' ? 'work-orders-tab' : ''}`.trim()}
            onClick={() => {
              if (tab === 'work_orders') {
                window.location.hash = '#/my-work-orders'
                window.dispatchEvent(new HashChangeEvent('hashchange'))
                return
              }
              setActiveTab(tab)
            }}
          >
            {TAB_LABELS[tab] || tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="portal-grid">
          <div className="portal-card">
            <h3>Profile</h3>
            {profile ? (
              <div className="portal-list">
                <div className="portal-list-item">
                  <strong>{profile.first_name} {profile.last_name}</strong>
                  <span className="portal-muted">{profile.email}</span>
                  {profile.phone && <span className="portal-muted">{profile.phone}</span>}
                </div>
              </div>
            ) : (
              <p className="portal-muted">Profile details will appear here.</p>
            )}
          </div>
          <div className="portal-card">
            <h3>Quick stats</h3>
            <div className="portal-list">
              <div className="portal-list-item">
                <strong>{orders.length}</strong>
                <span className="portal-muted">Orders placed</span>
              </div>
              <div className="portal-list-item">
                <strong>{favorites.length}</strong>
                <span className="portal-muted">Wishlist saved</span>
              </div>
              <div className="portal-list-item">
                <strong>{cartItems.length}</strong>
                <span className="portal-muted">Items in cart</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="portal-grid">
          <div className="portal-card">
            <h3>Order history</h3>
            {orders.length === 0 ? (
              <p className="portal-muted">No orders yet. Your manual orders will appear here.</p>
            ) : (
              <div className="portal-list">
                {orders.map((order) => (
                  <div key={order.id} className="portal-list-item">
                    <strong>{order.order_number || `Order #${order.id}`}</strong>
                    <span className="portal-muted">Status: {order.status}</span>
                    <span className="portal-muted">
                      Total: {order.total_amount ? `$${order.total_amount}` : 'TBD'} {order.currency || ''}
                    </span>
                    {(orderItems[order.id] || []).length > 0 && (
                      <div className="portal-list">
                        {orderItems[order.id].map((item) => (
                          <div key={item.id} className="portal-list-item">
                            <strong>{renderProductLabel(item.product_type, item.product_id)}</strong>
                            <span className="portal-muted">Qty: {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="portal-card">
            <h3>Open invoices</h3>
            {invoices.length === 0 ? (
              <p className="portal-muted">No invoices at this time. Invoices from work orders will appear here.</p>
            ) : (
              <div className="portal-list">
                {invoices.map((invoice) => {
                  const invoiceAmount = parseFloat(invoice.amount || 0);
                  const invoiceDate = new Date(invoice.created_at || '').toLocaleDateString();
                  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'Not specified';
                  return (
                    <div key={invoice.id} className="portal-list-item">
                      <strong>{invoice.invoice_number || `Invoice #${invoice.id}`}</strong>
                      <span className="portal-muted">Status: {invoice.status}</span>
                      <span className="portal-muted">
                        Amount: ${invoiceAmount.toFixed(2)}
                      </span>
                      <span className="portal-muted">
                        Created: {invoiceDate}
                      </span>
                      <span className="portal-muted">
                        Due: {dueDate}
                      </span>
                      {invoice.notes && (
                        <span className="portal-muted" style={{ fontStyle: 'italic' }}>
                          Notes: {invoice.notes}
                        </span>
                      )}
                      <div className="portal-actions">
                        <button
                          className="secondary"
                          onClick={() => handleViewInvoice(invoice.id)}
                          disabled={invoiceViewLoading}
                        >
                          {invoiceViewLoadingId === invoice.id ? 'Loading...' : 'View invoice'}
                        </button>
                        <button 
                          className="secondary" 
                          onClick={() => handleAddInvoiceToCart(invoice.id)}
                        >
                          Add to cart
                        </button>
                        <button
                          className="secondary"
                          onClick={() => handleDeleteInvoice(invoice.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="portal-card">
          <h3>Wishlist</h3>
          {favorites.length === 0 ? (
            <p className="portal-muted">Save products you love to find them quickly later.</p>
          ) : (
            <div className="portal-list">
              {favorites.map((item) => (
                <div key={item.id} className="portal-list-item">
                  <strong>{renderProductLabel(item.product_type, item.product_id)}</strong>
                  <div className="portal-actions">
                    <button className="secondary" onClick={() => handleViewWishlistItem(item)}>
                      View
                    </button>
                    <button className="secondary" onClick={() => handleRemoveFavorite(item.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cart' && (
        <div className="portal-card">
          <h3>Saved cart</h3>
          {cartItems.length === 0 ? (
            <p className="portal-muted">Your cart is empty.</p>
          ) : (
            <>
              <div className="portal-list">
                {cartItems.map((item) => (
                  <div key={item.id} className="portal-list-item">
                    <strong>{renderProductLabel(item.product_type, item.product_id)}</strong>
                    <span className="portal-muted">Quantity: {item.quantity}</span>
                    <div className="portal-actions">
                      <button className="secondary" onClick={() => handleUpdateCartQuantity(item.id, item.quantity + 1)}>
                        +1
                      </button>
                      <button className="secondary" onClick={() => handleUpdateCartQuantity(item.id, Math.max(1, item.quantity - 1))}>
                        -1
                      </button>
                      <button className="secondary" onClick={() => handleMoveCartItemToWishlist(item)}>
                        Move to wishlist
                      </button>
                      <button onClick={() => handleRemoveCartItem(item.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="portal-actions" style={{ marginTop: '0.75rem' }}>
                <button onClick={() => { window.location.hash = '#/checkout' }}>Proceed to checkout</button>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="portal-grid">
          <div className="portal-card">
            <h3>Submit a review</h3>
            <form className="portal-form" onSubmit={handleSubmitReview}>
              <select
                value={reviewForm.review_key}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, review_key: event.target.value }))
                }
                disabled={Boolean(reviewForm.review_id)}
                required
              >
                {reviewOptions.length === 0 ? (
                  <option value="">No purchased items available</option>
                ) : (
                  reviewOptions.map((item) => (
                    <option
                      key={`${item.product_type}:${item.product_id}`}
                      value={`${item.product_type}:${item.product_id}`}
                    >
                      {renderReviewOptionLabel(item)}
                    </option>
                  ))
                )}
              </select>
              <div className="portal-star-rating" role="radiogroup" aria-label="Select rating">
                {STAR_SCALE.map((value) => {
                  const isActive = Number(reviewForm.rating) >= value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      className={`portal-star-button ${isActive ? 'active' : ''}`}
                      onClick={() => setReviewForm((prev) => ({ ...prev, rating: value }))}
                    >
                      ★
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                placeholder="Review title"
                value={reviewForm.title}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
              <textarea
                placeholder="Tell us about your experience..."
                value={reviewForm.body}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, body: event.target.value }))
                }
                required
              />
              <button type="submit">{reviewForm.review_id ? 'Save changes' : 'Submit review'}</button>
              {reviewForm.review_id ? (
                <button type="button" className="secondary" onClick={handleCancelEditReview}>
                  Cancel edit
                </button>
              ) : null}
            </form>
            <p className="portal-muted">
              Reviews are available for verified buyers only. If you do not have an order on file,
              the review will be rejected.
            </p>
          </div>
          <div className="portal-card">
            <h3>Your reviews</h3>
            {reviews.length === 0 ? (
              <p className="portal-muted">No reviews yet.</p>
            ) : (
              <div className="portal-list">
                {reviews.map((review) => (
                  <div key={review.id} className="portal-list-item">
                    <strong>{renderProductLabel(review.product_type, review.product_id)}</strong>
                    <span className="portal-muted">Rating: <span className="portal-stars-readonly">{renderStars(review.rating)}</span></span>
                    <span className="portal-muted">Status: {review.status}</span>
                    {review.title && <span>{review.title}</span>}
                    {review.body && <span>{review.body}</span>}
                    <div className="portal-actions">
                      <button className="secondary" type="button" onClick={() => handleStartEditReview(review)}>
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="portal-card">
          <div className="portal-subtabs">
            <button
              className={settingsTab === 'profile' ? 'active' : ''}
              onClick={() => setSettingsTab('profile')}
            >
              Profile
            </button>
            <button
              className={settingsTab === 'address' ? 'active' : ''}
              onClick={() => setSettingsTab('address')}
            >
              Address
            </button>
            <button
              className={settingsTab === 'password' ? 'active' : ''}
              onClick={() => setSettingsTab('password')}
            >
              Password
            </button>
          </div>

          {settingsTab === 'profile' && (
            <form className="portal-form" onSubmit={handleProfileSubmit}>
              <h3>Profile</h3>
              <input
                type="text"
                placeholder="First name"
                value={profileForm.first_name}
                onChange={(event) =>
                  setProfileForm((prev) => ({ ...prev, first_name: event.target.value }))
                }
              />
              <input
                type="text"
                placeholder="Last name"
                value={profileForm.last_name}
                onChange={(event) =>
                  setProfileForm((prev) => ({ ...prev, last_name: event.target.value }))
                }
              />
              <input type="email" value={profileForm.email} disabled />
              <input
                type="text"
                placeholder="Phone"
                value={profileForm.phone}
                onChange={(event) =>
                  setProfileForm((prev) => ({ ...prev, phone: event.target.value }))
                }
              />
              <button type="submit">Save profile</button>
            </form>
          )}

          {settingsTab === 'address' && (
            <form className="portal-form" onSubmit={handleAddressSubmit}>
              <h3>Address</h3>
              <input
                type="text"
                placeholder="Label (Home, Studio)"
                value={addressForm.label}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, label: event.target.value }))}
              />
              <input
                type="text"
                placeholder="Line 1"
                value={addressForm.line1}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, line1: event.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Line 2"
                value={addressForm.line2}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, line2: event.target.value }))}
              />
              <input
                type="text"
                placeholder="City"
                value={addressForm.city}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, city: event.target.value }))}
              />
              <input
                type="text"
                placeholder="State"
                value={addressForm.state}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, state: event.target.value }))}
              />
              <input
                type="text"
                placeholder="Postal code"
                value={addressForm.postal_code}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, postal_code: event.target.value }))}
              />
              <input
                type="text"
                placeholder="Country"
                value={addressForm.country}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, country: event.target.value }))}
              />
              <button type="submit">Save address</button>
            </form>
          )}

          {settingsTab === 'password' && (
            <form className="portal-form" onSubmit={handlePasswordSubmit}>
              <h3>Password</h3>
              <input
                type="email"
                name="username"
                autoComplete="username"
                value={profileForm.email || ''}
                readOnly
                className="portal-visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                type="password"
                placeholder="Current password"
                autoComplete="current-password"
                value={passwordForm.old_password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, old_password: event.target.value }))
                }
                required
              />
              <input
                type="password"
                placeholder="New password"
                autoComplete="new-password"
                value={passwordForm.new_password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))
                }
                required
              />
              <input
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={passwordForm.confirm_password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))
                }
                required
              />
              <button type="submit">Change password</button>
            </form>
          )}
        </div>
      )}

      {selectedInvoice && (
        <div className="invoice-view-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="invoice-view-modal" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-view-header">
              <div>
                <p className="invoice-view-kicker">SGCG ART GLASS INVOICE</p>
                <h2>{selectedInvoice.invoice_number || `Invoice #${selectedInvoice.id}`}</h2>
              </div>
              <span className={`invoice-status-pill ${String(selectedInvoice.status || 'open').toLowerCase()}`}>
                {selectedInvoice.status || 'open'}
              </span>
            </div>

            <div className="invoice-view-actions-top">
              <button onClick={() => handleAddInvoiceToCart(selectedInvoice.id)}>Add to cart</button>
              <button className="secondary" onClick={() => setSelectedInvoice(null)}>Close</button>
            </div>

            <div className="invoice-view-grid">
              <section className="invoice-view-card">
                <h3>Customer</h3>
                <div className="invoice-view-row"><strong>Name</strong><span>{`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Customer'}</span></div>
                <div className="invoice-view-row"><strong>Email</strong><span>{profile?.email || 'Not available'}</span></div>
              </section>

              <section className="invoice-view-card">
                <h3>Invoice Details</h3>
                <div className="invoice-view-row"><strong>Work Order</strong><span>{selectedInvoice.work_order_number || (selectedInvoice.work_order_id ? `WO-${selectedInvoice.work_order_id}` : 'N/A')}</span></div>
                <div className="invoice-view-row"><strong>Amount</strong><span>${Number(selectedInvoice.amount || 0).toFixed(2)}</span></div>
                <div className="invoice-view-row"><strong>Created</strong><span>{selectedInvoice.created_at ? new Date(selectedInvoice.created_at).toLocaleDateString() : 'N/A'}</span></div>
                <div className="invoice-view-row"><strong>Due Date</strong><span>{selectedInvoice.due_date ? new Date(selectedInvoice.due_date).toLocaleDateString() : 'Not specified'}</span></div>
              </section>
            </div>

            <section className="invoice-view-card invoice-view-preview">
              <h3>Approved Design Preview</h3>
              {selectedInvoice.work_order_preview_url ? (
                <img
                  src={selectedInvoice.work_order_preview_url}
                  alt="Approved work order design preview"
                  className="invoice-preview-image"
                />
              ) : (
                <p className="portal-muted">No preview image available for this work order yet.</p>
              )}
            </section>

            <section className="invoice-view-card invoice-view-notes">
              <h3>Notes</h3>
              <p>{selectedInvoice.notes || 'No additional notes provided for this invoice.'}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
