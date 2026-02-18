import { useEffect, useMemo, useState } from 'react'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import '../../styles/CustomerPortal.css'
import {
  fetchCustomerProfile,
  fetchCustomerAddresses,
  addCustomerAddress,
  fetchCustomerFavorites,
  removeCustomerFavorite,
  fetchCustomerCart,
  updateCustomerCartItem,
  removeCustomerCartItem,
  fetchCustomerOrders,
  fetchCustomerOrderItems,
  fetchCustomerReviews,
  createCustomerReview,
} from '../../services/api'

const TABS = ['overview', 'orders', 'favorites', 'cart', 'reviews', 'settings']

export default function CustomerPortal({ manualProducts }) {
  const { customerToken, logout } = useCustomerAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [favorites, setFavorites] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState({})
  const [reviews, setReviews] = useState([])
  const [status, setStatus] = useState('')
  const [addressForm, setAddressForm] = useState({
    label: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  })
  const [reviewForm, setReviewForm] = useState({
    product_type: 'manual',
    product_id: '',
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
        const [profileData, addressData, favoriteData, cartData, orderData, reviewData] =
          await Promise.all([
            fetchCustomerProfile(customerToken),
            fetchCustomerAddresses(customerToken),
            fetchCustomerFavorites(customerToken),
            fetchCustomerCart(customerToken),
            fetchCustomerOrders(customerToken),
            fetchCustomerReviews(customerToken),
          ])

        if (!isActive) return
        setProfile(profileData)
        setAddresses(addressData)
        setFavorites(favoriteData)
        setCartItems(cartData)
        setOrders(orderData)
        setReviews(reviewData)

        const itemsByOrder = {}
        await Promise.all(
          orderData.map(async (order) => {
            const items = await fetchCustomerOrderItems(customerToken, order.id)
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

  const handleAddressSubmit = async (event) => {
    event.preventDefault()
    setStatus('')
    try {
      const response = await addCustomerAddress(customerToken, addressForm)
      setAddresses((prev) => [
        {
          id: response.id,
          ...addressForm,
        },
        ...prev,
      ])
      setAddressForm({
        label: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: '',
      })
    } catch (error) {
      setStatus(error.message || 'Unable to save address.')
    }
  }

  const handleRemoveFavorite = async (favoriteId) => {
    await removeCustomerFavorite(customerToken, favoriteId)
    setFavorites((prev) => prev.filter((item) => item.id !== favoriteId))
  }

  const handleUpdateCartQuantity = async (itemId, quantity) => {
    await updateCustomerCartItem(customerToken, itemId, { quantity })
    setCartItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
    )
  }

  const handleRemoveCartItem = async (itemId) => {
    await removeCustomerCartItem(customerToken, itemId)
    setCartItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const handleSubmitReview = async (event) => {
    event.preventDefault()
    setStatus('')
    try {
      const payload = {
        ...reviewForm,
        rating: Number(reviewForm.rating),
      }
      const response = await createCustomerReview(customerToken, payload)
      setReviews((prev) => [
        {
          id: response.id,
          ...payload,
          status: 'pending',
        },
        ...prev,
      ])
      setReviewForm({
        product_type: 'manual',
        product_id: '',
        rating: 5,
        title: '',
        body: '',
      })
    } catch (error) {
      setStatus(error.message || 'Unable to submit review.')
    }
  }

  const renderProductLabel = (productType, productId) => {
    if (productType === 'manual') {
      const product = manualProductMap.get(String(productId))
      return product ? product.name : `Manual product #${productId}`
    }
    return `Etsy item ${productId}`
  }

  return (
    <div className="customer-portal">
      <div className="customer-portal-header">
        <h2>Customer portal</h2>
        <p>Manage your account, track orders, and keep tabs on favorites.</p>
      </div>

      {status && <div className="customer-auth-error">{status}</div>}

      <div className="portal-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
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
                <span className="portal-muted">Favorites saved</span>
              </div>
              <div className="portal-list-item">
                <strong>{cartItems.length}</strong>
                <span className="portal-muted">Items in cart</span>
              </div>
            </div>
          </div>
          <div className="portal-card">
            <h3>Security</h3>
            <p className="portal-muted">Use the settings tab to manage saved addresses and sign out.</p>
            <div className="portal-actions">
              <button className="secondary" onClick={logout}>Sign out</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="portal-card">
          <h3>Order history</h3>
          {orders.length === 0 ? (
            <p className="portal-muted">No orders yet. Your Etsy or manual orders will appear here.</p>
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
      )}

      {activeTab === 'favorites' && (
        <div className="portal-card">
          <h3>Favorites</h3>
          {favorites.length === 0 ? (
            <p className="portal-muted">Save products you love to find them quickly later.</p>
          ) : (
            <div className="portal-list">
              {favorites.map((item) => (
                <div key={item.id} className="portal-list-item">
                  <strong>{renderProductLabel(item.product_type, item.product_id)}</strong>
                  <div className="portal-actions">
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
                    <button onClick={() => handleRemoveCartItem(item.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="portal-grid">
          <div className="portal-card">
            <h3>Submit a review</h3>
            <form className="portal-form" onSubmit={handleSubmitReview}>
              <select
                value={reviewForm.product_type}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, product_type: event.target.value }))
                }
              >
                <option value="manual">Manual products</option>
                <option value="etsy">Etsy items</option>
              </select>
              <input
                type="text"
                placeholder="Product ID"
                value={reviewForm.product_id}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, product_id: event.target.value }))
                }
                required
              />
              <input
                type="number"
                min="1"
                max="5"
                value={reviewForm.rating}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, rating: event.target.value }))
                }
                required
              />
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
              <button type="submit">Submit review</button>
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
                    <span className="portal-muted">Rating: {review.rating}/5</span>
                    <span className="portal-muted">Status: {review.status}</span>
                    {review.title && <span>{review.title}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="portal-grid">
          <div className="portal-card">
            <h3>Saved addresses</h3>
            {addresses.length === 0 ? (
              <p className="portal-muted">No addresses saved yet.</p>
            ) : (
              <div className="portal-list">
                {addresses.map((address) => (
                  <div key={address.id} className="portal-list-item">
                    <strong>{address.label || 'Address'}</strong>
                    <span className="portal-muted">{address.line1}</span>
                    {address.line2 && <span className="portal-muted">{address.line2}</span>}
                    <span className="portal-muted">
                      {address.city} {address.state} {address.postal_code}
                    </span>
                    <span className="portal-muted">{address.country}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="portal-card">
            <h3>Add new address</h3>
            <form className="portal-form" onSubmit={handleAddressSubmit}>
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
          </div>
        </div>
      )}
    </div>
  )
}
