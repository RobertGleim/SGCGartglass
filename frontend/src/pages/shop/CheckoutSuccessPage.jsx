import { useEffect, useRef, useState } from 'react'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import { confirmCheckoutSession } from '../../services/api'
import LoadingMessage from '../../components/LoadingMessage'
import { clearGuestCart } from '../../utils/guestCart'
import { getCurrentSearch } from '../../utils/navigation'
import './CheckoutPage.css'

export default function CheckoutSuccessPage() {
  const { customerToken } = useCustomerAuth()
  const [status, setStatus] = useState('loading')
  const [order, setOrder] = useState(null)
  const [downloads, setDownloads] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const hasTrackedConversion = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(getCurrentSearch().slice(1))
    const sessionId = params.get('session_id')

    if (!sessionId) {
      setStatus('error')
      setErrorMessage('No session ID found. If you completed a payment, check your order history.')
      return
    }

    if (!customerToken) {
      clearGuestCart()
      window.dispatchEvent(new Event('cart-updated'))
      setStatus('guest-success')
      return
    }

    confirmCheckoutSession(sessionId)
      .then((response) => {
        setOrder(response?.order || null)
        setDownloads(Array.isArray(response?.downloads) ? response.downloads : [])
        setStatus('success')
        window.dispatchEvent(new Event('cart-updated'))
      })
      .catch((error) => {
        const code = error?.response?.data?.error
        if (code === 'payment_not_complete') {
          setStatus('pending')
          setErrorMessage('Payment is still processing. Your order will be confirmed shortly.')
        } else {
          setStatus('error')
          setErrorMessage(error?.response?.data?.detail || error?.response?.data?.error || error.message || 'Unable to confirm your order.')
        }
      })
  }, [customerToken])

  useEffect(() => {
    if (hasTrackedConversion.current) return
    if (status !== 'success' && status !== 'guest-success') return

    const send = () => {
      if (typeof window.gtag !== 'function') return false
      window.gtag('event', 'conversion', {
        send_to: 'AW-18106685600/JSdOCJ6z-LMcEKCx-LlD',
      })
      hasTrackedConversion.current = true
      return true
    }

    if (!send()) {
      // gtag script not yet loaded — poll until ready or 5 s timeout
      const interval = setInterval(() => { if (send()) clearInterval(interval) }, 200)
      const timeout = setTimeout(() => clearInterval(interval), 5000)
      return () => { clearInterval(interval); clearTimeout(timeout) }
    }
  }, [status])

  return (
    <main className="checkout-page">
      <section className="checkout-main checkout-main--narrow">
        {status === 'loading' && (
          <div className="checkout-card">
            <LoadingMessage label="Confirming your order" />
          </div>
        )}

        {status === 'success' && order && (
          <div className="checkout-success-card">
            <div className="checkout-success-icon" aria-hidden="true">
              <svg viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="25" stroke="#27ae60" strokeWidth="2"/>
                <path d="M14 26l9 9 15-15" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>Thank you for your order!</h2>
            <p className="checkout-success-tagline">We appreciate your business!</p>
            <div className="checkout-success-details">
              <div className="checkout-success-row">
                <span>Order number</span>
                <strong>{order.order_number}</strong>
              </div>
              <div className="checkout-success-row">
                <span>Payment</span>
                <strong className="checkout-success-paid">Paid</strong>
              </div>
              <div className="checkout-success-row">
                <span>Total charged</span>
                <strong>${Number(order.total_amount || 0).toFixed(2)} {order.currency || 'USD'}</strong>
              </div>
            </div>
            <p className="checkout-success-contact">
              If you have any questions, please email{' '}
              <a href="mailto:customersupport@sgcgart.com">customersupport@sgcgart.com</a>.
            </p>
            {downloads.length > 0 && (
              <p className="checkout-success-contact">
                Your digital pattern download is ready now in <a href="/account">your customer portal</a> and has also been emailed to you.
              </p>
            )}
            <div className="checkout-success-actions">
              <a className="checkout-link checkout-link--primary" href="/account">View my orders</a>
              <a className="checkout-link" href="/product">Continue shopping</a>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="checkout-success-card">
            <h2>Payment processing</h2>
            <p>{errorMessage}</p>
            <p className="checkout-success-contact">
              Questions? Email <a href="mailto:customersupport@sgcgart.com">customersupport@sgcgart.com</a>.
            </p>
            <div className="checkout-success-actions">
              <a className="checkout-link" href="/account">Check order history</a>
            </div>
          </div>
        )}

        {status === 'guest-success' && (
          <div className="checkout-success-card">
            <h2>Thank you for your order!</h2>
            <p>Your payment was received successfully.</p>
            <p className="checkout-success-contact">
              If your order included a digital download, we will send it to the email you entered in Stripe.
              For physical products, we will use the shipping address entered in Stripe.
            </p>
            <div className="checkout-success-actions">
              <a className="checkout-link" href="/product">Continue shopping</a>
              <a className="checkout-link" href="/account/login">Sign in to view order history</a>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="checkout-success-card">
            <h2>Something went wrong</h2>
            <p>{errorMessage}</p>
            <p className="checkout-success-contact">
              Need help? Email <a href="mailto:customersupport@sgcgart.com">customersupport@sgcgart.com</a>.
            </p>
            <div className="checkout-success-actions">
              <a className="checkout-link" href="/checkout">Back to checkout</a>
              <a className="checkout-link" href="/account">My orders</a>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
