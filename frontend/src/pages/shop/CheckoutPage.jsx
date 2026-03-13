import { useEffect, useMemo, useState } from 'react'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import {
  createCheckoutSession,
  fetchCustomerCartSummary,
  removeCustomerCartItem,
  updateCustomerCartItem,
} from '../../services/api'
import LoadingMessage from '../../components/LoadingMessage'
import './CheckoutPage.css'

const SINGLE_ITEM_WARNING = 'Items are sold per piece. Please contact customer service if you need more than one of the same item.'

const toNumber = (value) => Number(value || 0)

const computeLocalTotals = (items) => {
  const normalizedItems = Array.isArray(items) ? items : []
  const itemCount = normalizedItems.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity) || 0), 0)
  const subtotal = normalizedItems.reduce((sum, item) => sum + toNumber(item?.line_total), 0)
  const shipping = subtotal <= 0 ? 0 : subtotal >= 50 ? 0 : 9.99
  const tax = 0
  const total = subtotal + shipping + tax
  return {
    item_count: itemCount,
    subtotal,
    shipping,
    tax,
    total,
    currency: 'USD',
  }
}

function ProductCard({ item, onRemove }) {
  return (
    <div className="checkout-product">
      {item.image_url && (
        <img
          className="checkout-product-img"
          src={item.image_url}
          alt={item.title || 'Product image'}
        />
      )}
      <div className="checkout-product-info">
        <h3 className="checkout-product-name">{item.title}</h3>
        <p className="checkout-product-price">${Number(item.price || 0).toFixed(2)}</p>
        {item.quantity > 1 && (
          <p className="checkout-product-qty">Qty: {item.quantity}</p>
        )}
      </div>
      <button
        className="checkout-product-remove"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.title}`}
      >
        &times;
      </button>
    </div>
  )
}

export default function CheckoutPage() {
  const { customerToken } = useCustomerAuth()
  const [summary, setSummary] = useState({ items: [], totals: null })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [redirecting, setRedirecting] = useState(false)

  const canCheckout = (summary.items || []).length > 0
  const isSingleItemWarning = status === SINGLE_ITEM_WARNING

  const totals = useMemo(
    () => summary.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0, currency: 'USD' },
    [summary.totals],
  )

  const loadSummary = async () => {
    setLoading(true)
    try {
      const data = await fetchCustomerCartSummary()
      setSummary({
        items: Array.isArray(data?.items) ? data.items : [],
        totals: data?.totals || null,
      })
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to load checkout cart.')
    } finally {
      setLoading(false)
    }
  }

  const syncSummarySilently = async () => {
    try {
      const data = await fetchCustomerCartSummary()
      setSummary({
        items: Array.isArray(data?.items) ? data.items : [],
        totals: data?.totals || null,
      })
    } catch {
      // Keep optimistic UI state if silent refresh fails.
    }
  }

  useEffect(() => {
    if (!customerToken) {
      return
    }
    loadSummary()
  }, [customerToken])

  const handleUpdateQty = async (itemId, quantity) => {
    const next = Math.max(1, Number(quantity) || 1)
    if (next > 1) {
      setStatus(SINGLE_ITEM_WARNING)
      return
    }
    const existingItem = (summary.items || []).find((item) => item.id === itemId)
    if (!existingItem || Number(existingItem.quantity || 1) === next) {
      return
    }
    try {
      await updateCustomerCartItem(itemId, { quantity: next })
      window.dispatchEvent(new Event('cart-updated'))
      syncSummarySilently()
    } catch (error) {
      const apiError = error?.response?.data?.error
      if (apiError === 'single_item_limit') {
        setStatus(SINGLE_ITEM_WARNING)
      } else {
        setStatus(error?.response?.data?.message || error?.response?.data?.error || error.message || 'Unable to update quantity.')
      }
    }
  }

  const handleRemoveItem = async (itemId) => {
    const currentItems = Array.isArray(summary.items) ? summary.items : []
    const nextItems = currentItems.filter((item) => item.id !== itemId)
    setSummary({
      items: nextItems,
      totals: computeLocalTotals(nextItems),
    })
    setStatus('')

    try {
      await removeCustomerCartItem(itemId)
      window.dispatchEvent(new Event('cart-updated'))
      syncSummarySilently()
    } catch (error) {
      setStatus(error?.response?.data?.error || error.message || 'Unable to remove item.')
      syncSummarySilently()
    }
  }

  const handleStripeCheckout = async () => {
    setStatus('')
    setRedirecting(true)
    try {
      const response = await createCheckoutSession()
      const url = response?.url
      if (!url) throw new Error('No checkout URL returned.')
      window.location.href = url
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.error || error.message || 'Unable to start Stripe Checkout.'
      setStatus(message)
      setRedirecting(false)
    }
  }

  if (!customerToken) {
    return (
      <main className="checkout-page">
        <section className="checkout-card">
          <h2>Checkout</h2>
          <p>Please sign in to continue checkout.</p>
          <a className="checkout-link" href="#/account/login">Go to Sign In</a>
        </section>
      </main>
    )
  }

  return (
    <main className="checkout-page">
      <section className="checkout-main">
        <header className="checkout-header">
          <h2>Order Preview</h2>
          <p className="checkout-header-sub">Review your items before proceeding to payment. Once you continue to Stripe, the order is final.</p>
        </header>

        {status && (
          <div className={`checkout-status ${isSingleItemWarning ? 'warning' : ''}`.trim()}>
            {status}
          </div>
        )}

        {loading ? (
          <div className="checkout-card"><LoadingMessage label="Loading your cart" /></div>
        ) : (
          <div className="checkout-layout">
            <div className="checkout-left">
              {(summary.items || []).length === 0 ? (
                <div className="checkout-card checkout-empty">
                  <p>Your cart is empty.</p>
                  <a className="checkout-link" href="#/product">Continue shopping</a>
                </div>
              ) : (
                <div className="checkout-products">
                  {summary.items.map((item) => (
                    <ProductCard key={item.id} item={item} onRemove={handleRemoveItem} />
                  ))}
                </div>
              )}
            </div>

            <aside className="checkout-right">
              <div className="checkout-summary-card sticky">
                <h3 className="checkout-summary-title">Order Summary</h3>
                <div className="checkout-summary-lines">
                  <div className="checkout-summary-row">
                    <span>Subtotal ({totals.item_count || 0} {(totals.item_count || 0) === 1 ? 'item' : 'items'})</span>
                    <span>${Number(totals.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="checkout-summary-row">
                    <span>Shipping</span>
                    <span>{Number(totals.shipping || 0) === 0 ? 'Free' : `$${Number(totals.shipping).toFixed(2)}`}</span>
                  </div>
                  <div className="checkout-summary-row">
                    <span>Tax</span>
                    <span>${Number(totals.tax || 0).toFixed(2)}</span>
                  </div>
                </div>
                <div className="checkout-summary-total">
                  <span>Total</span>
                  <span>${Number(totals.total || 0).toFixed(2)} {totals.currency || 'USD'}</span>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); handleStripeCheckout() }}
                  className="checkout-form"
                >
                  <button
                    type="submit"
                    id="checkout-button"
                    className="checkout-stripe-btn"
                    disabled={!canCheckout || redirecting}
                  >
                    {redirecting ? 'Redirecting…' : 'Checkout'}
                  </button>
                </form>

                <p className="checkout-secure-note">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                  Secure checkout powered by Stripe
                </p>

                <p className="checkout-contact-note">
                  Questions? Email <a href="mailto:customersupport@sgcgart.com">customersupport@sgcgart.com</a>
                </p>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
