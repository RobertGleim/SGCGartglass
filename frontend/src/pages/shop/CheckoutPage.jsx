import { useEffect, useMemo, useState } from 'react'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import {
  createCheckoutIntent,
  fetchCustomerCartSummary,
  placeCustomerOrder,
  removeCustomerCartItem,
  updateCustomerCartItem,
} from '../../services/api'
import '../../styles/CheckoutPage.css'

const EMPTY_ADDRESS = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
}

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

export default function CheckoutPage() {
  const { customerToken } = useCustomerAuth()
  const [summary, setSummary] = useState({ items: [], totals: null })
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('cart')
  const [status, setStatus] = useState('')
  const [shippingAddress, setShippingAddress] = useState(EMPTY_ADDRESS)
  const [billingAddress, setBillingAddress] = useState(EMPTY_ADDRESS)
  const [sameBillingAsShipping, setSameBillingAsShipping] = useState(true)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [intentInfo, setIntentInfo] = useState(null)
  const [orderSuccess, setOrderSuccess] = useState(null)

  const canProceedFromCart = (summary.items || []).length > 0
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

  const handleCreateIntent = async () => {
    setStatus('')
    try {
      const response = await createCheckoutIntent({ shipping_address: shippingAddress })
      setIntentInfo(response?.intent || null)
      setStep('review')
      setStatus('Payment step prepared. Review and place order.')
    } catch (error) {
      const message = error?.response?.data?.error || error.message || 'Unable to prepare payment.'
      setStatus(message)
    }
  }

  const handlePlaceOrder = async () => {
    setStatus('')
    try {
      const billing = sameBillingAsShipping ? shippingAddress : billingAddress
      const response = await placeCustomerOrder({
        customer_name: customerName,
        customer_email: customerEmail,
        shipping_address: shippingAddress,
        billing_address: billing,
        payment_intent_id: intentInfo?.payment_intent_id,
        notes: orderNotes,
      })
      setOrderSuccess(response?.order || null)
      setStep('done')
      await loadSummary()
      window.dispatchEvent(new Event('cart-updated'))
    } catch (error) {
      const message = error?.response?.data?.error || error.message || 'Unable to place order.'
      setStatus(message)
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
          <h2>Checkout</h2>
          <p>Cart → Shipping → Payment → Review</p>
        </header>

        {status && <div className={`checkout-status ${isSingleItemWarning ? 'warning' : ''}`.trim()}>{status}</div>}

        {loading ? (
          <div className="checkout-card"><p>Loading checkout…</p></div>
        ) : (
          <div className="checkout-layout">
            <div className="checkout-left">
              {step === 'cart' && (
                <div className="checkout-card">
                  <h3>Cart</h3>
                  {(summary.items || []).length === 0 ? (
                    <p>Your cart is empty.</p>
                  ) : (
                    <div className="checkout-list">
                      {summary.items.map((item) => (
                        <div key={item.id} className="checkout-list-item">
                          <div>
                            <strong>{item.title}</strong>
                            <p>Unit: ${Number(item.price || 0).toFixed(2)}</p>
                          </div>
                          <div className="checkout-item-actions">
                            <button onClick={() => handleUpdateQty(item.id, item.quantity - 1)}>-</button>
                            <span>{item.quantity}</span>
                            <button onClick={() => handleUpdateQty(item.id, item.quantity + 1)}>+</button>
                            <button onClick={() => handleRemoveItem(item.id)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="checkout-actions-row">
                    <button disabled={!canProceedFromCart} onClick={() => setStep('shipping')}>Continue to shipping</button>
                  </div>
                </div>
              )}

              {step === 'shipping' && (
                <div className="checkout-card">
                  <h3>Shipping details</h3>
                  <div className="checkout-form-grid">
                    <input placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                    <input placeholder="Email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                    <input placeholder="Address line 1" value={shippingAddress.line1} onChange={(e) => setShippingAddress((prev) => ({ ...prev, line1: e.target.value }))} />
                    <input placeholder="Address line 2" value={shippingAddress.line2} onChange={(e) => setShippingAddress((prev) => ({ ...prev, line2: e.target.value }))} />
                    <input placeholder="City" value={shippingAddress.city} onChange={(e) => setShippingAddress((prev) => ({ ...prev, city: e.target.value }))} />
                    <input placeholder="State" value={shippingAddress.state} onChange={(e) => setShippingAddress((prev) => ({ ...prev, state: e.target.value }))} />
                    <input placeholder="Postal code" value={shippingAddress.postal_code} onChange={(e) => setShippingAddress((prev) => ({ ...prev, postal_code: e.target.value }))} />
                    <input placeholder="Country" value={shippingAddress.country} onChange={(e) => setShippingAddress((prev) => ({ ...prev, country: e.target.value }))} />
                  </div>

                  <label className="checkout-checkbox">
                    <input
                      type="checkbox"
                      checked={sameBillingAsShipping}
                      onChange={(e) => setSameBillingAsShipping(e.target.checked)}
                    />
                    Billing address same as shipping
                  </label>

                  {!sameBillingAsShipping && (
                    <div className="checkout-form-grid">
                      <input placeholder="Billing line 1" value={billingAddress.line1} onChange={(e) => setBillingAddress((prev) => ({ ...prev, line1: e.target.value }))} />
                      <input placeholder="Billing city" value={billingAddress.city} onChange={(e) => setBillingAddress((prev) => ({ ...prev, city: e.target.value }))} />
                      <input placeholder="Billing state" value={billingAddress.state} onChange={(e) => setBillingAddress((prev) => ({ ...prev, state: e.target.value }))} />
                      <input placeholder="Billing postal code" value={billingAddress.postal_code} onChange={(e) => setBillingAddress((prev) => ({ ...prev, postal_code: e.target.value }))} />
                      <input placeholder="Billing country" value={billingAddress.country} onChange={(e) => setBillingAddress((prev) => ({ ...prev, country: e.target.value }))} />
                    </div>
                  )}

                  <textarea placeholder="Order notes (optional)" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />

                  <div className="checkout-actions-row">
                    <button className="secondary" onClick={() => setStep('cart')}>Back</button>
                    <button onClick={() => setStep('payment')}>Continue to payment</button>
                  </div>
                </div>
              )}

              {step === 'payment' && (
                <div className="checkout-card">
                  <h3>Payment</h3>
                  <p>
                    This checkout uses Stripe payment intents.
                    {intentInfo?.mode === 'mock' ? ' Running in mock mode until STRIPE_SECRET_KEY is configured.' : ''}
                  </p>
                  <div className="checkout-actions-row">
                    <button className="secondary" onClick={() => setStep('shipping')}>Back</button>
                    <button onClick={handleCreateIntent}>Prepare payment intent</button>
                  </div>
                </div>
              )}

              {step === 'review' && (
                <div className="checkout-card">
                  <h3>Review & place order</h3>
                  <p>Payment intent: {intentInfo?.payment_intent_id || 'N/A'}</p>
                  <p>Mode: {intentInfo?.mode || 'mock'}</p>
                  <div className="checkout-actions-row">
                    <button className="secondary" onClick={() => setStep('payment')}>Back</button>
                    <button onClick={handlePlaceOrder}>Place order</button>
                  </div>
                </div>
              )}

              {step === 'done' && (
                <div className="checkout-card">
                  <h3>Order placed</h3>
                  <p>Order number: {orderSuccess?.order_number}</p>
                  <p>Status: {orderSuccess?.status}</p>
                  <p>Payment: {orderSuccess?.payment_status}</p>
                  <div className="checkout-actions-row">
                    <a className="checkout-link" href="#/account">View orders in account</a>
                    <a className="checkout-link" href="#/product">Continue shopping</a>
                  </div>
                </div>
              )}
            </div>

            <aside className="checkout-right">
              <div className="checkout-card sticky">
                <h3>Order summary</h3>
                <p>Items: {totals.item_count || 0}</p>
                <p>Subtotal: ${Number(totals.subtotal || 0).toFixed(2)}</p>
                <p>Shipping: ${Number(totals.shipping || 0).toFixed(2)}</p>
                <p>Tax: ${Number(totals.tax || 0).toFixed(2)}</p>
                <p className="checkout-total">Total: ${Number(totals.total || 0).toFixed(2)}</p>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
