import { useEffect, useMemo, useState } from 'react'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import {
  createGuestCheckoutSession,
  createCheckoutSession,
  fetchCustomerCheckoutPreview,
  fetchGuestCheckoutPreview,
  fetchCustomerCartSummary,
  removeCustomerCartItem,
} from '../../services/api'
import { readGuestCart, removeGuestCartItem } from '../../utils/guestCart'
import LoadingMessage from '../../components/LoadingMessage'
import './CheckoutPage.css'

const SINGLE_ITEM_WARNING = 'Items are sold per piece. Please contact customer service if you need more than one of the same item.'

const toNumber = (value) => Number(value || 0)

const computeLocalTotals = (items) => {
  const normalizedItems = Array.isArray(items) ? items : []
  const itemCount = normalizedItems.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity) || 0), 0)
  const subtotal = normalizedItems.reduce((sum, item) => sum + toNumber(item?.line_total), 0)
  const shipping = 0
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
  const [guestEmail, setGuestEmail] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [appliedDiscountCode, setAppliedDiscountCode] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewWarnings, setPreviewWarnings] = useState([])
  const [previewDiscount, setPreviewDiscount] = useState(null)
  const [previewTotals, setPreviewTotals] = useState(null)

  const canCheckout = (summary.items || []).length > 0
  const isSingleItemWarning = status === SINGLE_ITEM_WARNING

  const totals = useMemo(
    () => previewTotals || summary.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0, currency: 'USD' },
    [previewTotals, summary.totals],
  )

  const normalizedGuestEmail = String(guestEmail || '').trim().toLowerCase()
  const normalizedCode = String(appliedDiscountCode || '').trim().toUpperCase()
  const codeSavings = Number(previewDiscount?.manual_amount ?? totals.manual_discount_amount ?? 0)
  const newCustomerSavings = Number(previewDiscount?.auto_amount ?? totals.auto_discount_amount ?? 0)

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

  const loadGuestSummary = () => {
    const items = readGuestCart()
    const rememberedEmail = String(window.localStorage.getItem('sgcg_guest_checkout_email') || '')
    setGuestEmail(rememberedEmail)
    setSummary({
      items,
      totals: computeLocalTotals(items),
    })
    setLoading(false)
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
      loadGuestSummary()
      const handleGuestCartRefresh = () => loadGuestSummary()
      window.addEventListener('cart-updated', handleGuestCartRefresh)
      return () => {
        window.removeEventListener('cart-updated', handleGuestCartRefresh)
      }
    }
    loadSummary()
  }, [customerToken])

  useEffect(() => {
    let isActive = true
    let debounceTimer = null

    const runPreview = async () => {
      if (!(summary.items || []).length) {
        if (!isActive) return
        setPreviewError('')
        setPreviewWarnings([])
        setPreviewDiscount(null)
        setPreviewTotals(null)
        return
      }

      if (!customerToken) {
        if (!normalizedGuestEmail) {
          if (!isActive) return
          setPreviewError('Enter your email to validate new-customer savings.')
          setPreviewWarnings([])
          setPreviewDiscount(null)
          setPreviewTotals(summary.totals || null)
          return
        }
        if (!normalizedGuestEmail.includes('@') || !normalizedGuestEmail.split('@')[1]?.includes('.')) {
          if (!isActive) return
          setPreviewError('Please enter a valid email address.')
          setPreviewWarnings([])
          setPreviewDiscount(null)
          setPreviewTotals(summary.totals || null)
          return
        }
      }

      try {
        const response = customerToken
          ? await fetchCustomerCheckoutPreview({ discount_code: normalizedCode || undefined })
          : await fetchGuestCheckoutPreview({
              customer_email: normalizedGuestEmail,
              discount_code: normalizedCode || undefined,
              items: (summary.items || []).map((item) => ({
                product_type: item.product_type,
                product_id: item.product_id,
                quantity: item.quantity || 1,
              })),
            })

        if (!isActive) return
        setPreviewError('')
        setPreviewWarnings(Array.isArray(response?.warnings) ? response.warnings : [])
        setPreviewDiscount(response?.discount || null)
        setPreviewTotals(response?.totals || summary.totals || null)
      } catch (error) {
        if (!isActive) return
        setPreviewError(error?.response?.data?.detail || error?.response?.data?.error || 'Unable to validate discount.')
        setPreviewWarnings([])
        setPreviewDiscount(null)
        setPreviewTotals(summary.totals || null)
      }
    }

    debounceTimer = window.setTimeout(runPreview, 180)
    return () => {
      isActive = false
      if (debounceTimer) {
        window.clearTimeout(debounceTimer)
      }
    }
  }, [customerToken, normalizedCode, normalizedGuestEmail, summary.items, summary.totals])

  const handleApplyDiscountCode = () => {
    setAppliedDiscountCode(String(discountCode || '').trim().toUpperCase())
  }

  const handleRemoveItem = async (itemId) => {
    const currentItems = Array.isArray(summary.items) ? summary.items : []
    const nextItems = currentItems.filter((item) => item.id !== itemId)
    setSummary({
      items: nextItems,
      totals: computeLocalTotals(nextItems),
    })
    setStatus('')

    if (!customerToken) {
      removeGuestCartItem(itemId)
      window.dispatchEvent(new Event('cart-updated'))
      loadGuestSummary()
      return
    }

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
      if (!customerToken) {
        if (!normalizedGuestEmail || !normalizedGuestEmail.includes('@') || !normalizedGuestEmail.split('@')[1]?.includes('.')) {
          throw new Error('Please enter a valid email before checkout.')
        }
        window.localStorage.setItem('sgcg_guest_checkout_email', normalizedGuestEmail)
      }

      const response = customerToken
        ? await createCheckoutSession({ discount_code: normalizedCode || undefined })
        : await createGuestCheckoutSession({
            items: (summary.items || []).map((item) => ({
              product_type: item.product_type,
              product_id: item.product_id,
              quantity: item.quantity || 1,
            })),
            customer_email: normalizedGuestEmail,
            discount_code: normalizedCode || undefined,
          })
      const url = response?.url
      if (!url) throw new Error('No checkout URL returned.')
      window.location.href = url
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.error || error.message || 'Unable to start Stripe Checkout.'
      setStatus(message)
      setRedirecting(false)
    }
  }

  return (
    <main className="checkout-page">
      <section className="checkout-main">
        <header className="checkout-header">
          <h2>Order Preview</h2>
          <p className="checkout-header-sub">Review your items before proceeding to payment. Once you continue to Stripe, the order is final.</p>
          <p className="checkout-offer-note">All new customers get 10% off automatically at checkout.</p>
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
                  <a className="checkout-link" href="/product">Continue shopping</a>
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
                    <span>${Number((totals.pre_discount_subtotal ?? totals.subtotal) || 0).toFixed(2)}</span>
                  </div>
                  {Number(totals.discount_amount || 0) > 0 && (
                    <>
                      {codeSavings > 0 ? (
                        <div className="checkout-summary-row checkout-summary-row-discount-meta">
                          <span>
                            {previewDiscount?.code
                              ? `Code ${previewDiscount.code} Savings`
                              : 'Discount Code Savings'}
                          </span>
                          <span>- ${codeSavings.toFixed(2)}</span>
                        </div>
                      ) : null}
                      {newCustomerSavings > 0 ? (
                        <div className="checkout-summary-row checkout-summary-row-discount-meta">
                          <span>New Customer Savings</span>
                          <span>- ${newCustomerSavings.toFixed(2)}</span>
                        </div>
                      ) : null}
                      <div className="checkout-summary-row checkout-summary-row-discount">
                        <span>Total Discount Savings</span>
                        <span>- ${Number(totals.discount_amount || 0).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="checkout-summary-row">
                      <span>Free shipping (USA)</span>
                      <span>Free</span>
                  </div>
                  <div className="checkout-summary-row">
                    <span>Tax (calculated by Stripe)</span>
                    <span>${Number(totals.tax || 0).toFixed(2)}</span>
                  </div>
                </div>
                <div className="checkout-summary-total">
                  <span>Total</span>
                  <span>${Number(totals.total || 0).toFixed(2)} {totals.currency || 'USD'}</span>
                </div>

                {previewError ? <p className="checkout-preview-error">{previewError}</p> : null}
                {previewWarnings.map((warning, index) => (
                  <p key={`preview-warning-${index}`} className="checkout-preview-warning">{warning}</p>
                ))}

                {previewDiscount && Number(totals.discount_amount || 0) > 0 ? (
                  <p className="checkout-preview-applied">
                    {codeSavings > 0 && newCustomerSavings > 0
                      ? `Both discounts applied: code ${previewDiscount?.code || ''} on regular items, and new customer discount on sale items.`
                      : previewDiscount?.source === 'new_customer_auto'
                        ? 'New customer discount applied.'
                        : `Discount code ${previewDiscount?.code || ''} applied.`}
                  </p>
                ) : null}

                <form
                  onSubmit={(e) => { e.preventDefault(); handleStripeCheckout() }}
                  className="checkout-form"
                >
                  {!customerToken && (
                    <label className="checkout-input-group" htmlFor="checkout-email">
                      <span>Email for receipt & discount</span>
                      <input
                        id="checkout-email"
                        type="email"
                        value={guestEmail}
                        onChange={(event) => setGuestEmail(event.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                      />
                    </label>
                  )}

                  <label className="checkout-input-group" htmlFor="checkout-discount-code">
                    <span>Discount code (optional)</span>
                    <div className="checkout-discount-apply-row">
                      <input
                        id="checkout-discount-code"
                        type="text"
                        value={discountCode}
                        onChange={(event) => {
                          const nextCode = event.target.value.toUpperCase()
                          setDiscountCode(nextCode)
                          if (!nextCode.trim()) {
                            setAppliedDiscountCode('')
                          }
                        }}
                        placeholder="SALE10"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="checkout-apply-code-btn"
                        onClick={handleApplyDiscountCode}
                        disabled={!discountCode.trim()}
                      >
                        Apply
                      </button>
                    </div>
                  </label>

                  <p className="checkout-discount-note">New customers automatically receive 10% off at checkout.</p>

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
