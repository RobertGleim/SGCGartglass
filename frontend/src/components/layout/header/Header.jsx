import '../../../styles/Header.css'
import { useEffect, useState } from 'react'
import { fetchCustomerCart } from '../../../services/api'
import { getGuestCartCount } from '../../../utils/guestCart'

export default function Header({ brandName, authToken, customerToken }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  useEffect(() => {
    const handleHashChange = () => setMenuOpen(false)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleNavClick = () => {
    setMenuOpen(false)
  }

  const openShopTab = (tabKey) => {
    window.sessionStorage.setItem('sgcg_shop_tab', tabKey)
    if (String(window.location.hash || '').startsWith('#/product')) {
      window.dispatchEvent(
        new CustomEvent('sgcg-shop-tab-change', {
          detail: { tab: tabKey },
        }),
      )
    }
    handleNavClick()
  }

  const handleOpenProducts = () => {
    openShopTab('stained-glass-panels')
  }

  const handleOpenBarginBasement = () => {
    openShopTab('bargin-basement')
  }

  useEffect(() => {
    let active = true

    const refreshCartCount = async () => {
      if (!customerToken) {
        if (active) setCartCount(getGuestCartCount())
        return
      }
      try {
        const items = await fetchCustomerCart()
        const count = (Array.isArray(items) ? items : []).reduce(
          (sum, item) => sum + Math.max(0, Number(item?.quantity) || 0),
          0,
        )
        if (active) setCartCount(count)
      } catch {
        if (active) setCartCount(0)
      }
    }

    refreshCartCount()
    const handleCartRefresh = () => refreshCartCount()
    window.addEventListener('hashchange', handleCartRefresh)
    window.addEventListener('cart-updated', handleCartRefresh)

    return () => {
      active = false
      window.removeEventListener('hashchange', handleCartRefresh)
      window.removeEventListener('cart-updated', handleCartRefresh)
    }
  }, [customerToken])

  return (
    <header className="site-header">
      <a href="#/" className="logo-block" aria-label="SGCG Art Glass - Go to home">
        <img src="/logo.png" alt="SGCG Art Glass logo" />
        <div className="header-origin-badge" aria-label="HandCrafted in the USA">
          <span className="header-origin-flag" aria-hidden="true">
            <span className="header-origin-flag-canton" />
          </span>
          <span className="header-origin-text">
            <span className="header-origin-line-primary">HandCrafted</span>
            <span className="header-origin-line-secondary">in the USA</span>
          </span>
        </div>
      </a>
      <button className="nav-toggle" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
        <span className="nav-toggle-icon">☰</span>
      </button>
      <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
        <a href="#/" onClick={handleNavClick}>Home</a>
        <a href="#/product" onClick={handleOpenProducts}>Product</a>
        <a href="#/product" onClick={handleOpenBarginBasement} className="nav-bargin-basement">Bargin Basement</a>
        <a href="#/reviews" onClick={handleNavClick}>Reviews</a>
        <a href="#/designer" onClick={handleNavClick}>Designer</a>
        <a href="#/gallery" onClick={handleNavClick}>Photo Gallery</a>
        {authToken ? (
          <a href="#/admin" onClick={handleNavClick}>Admin</a>
        ) : customerToken ? (
          <>
            <a href="#/my-projects" onClick={handleNavClick}>My Projects</a>
            <a
              href="#/checkout"
              onClick={handleNavClick}
              className="nav-cart-inline"
              aria-label="Open cart and checkout"
              title="Checkout"
            >
              🛒
              {cartCount > 0 && (
                <span className="nav-cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
              )}
            </a>
            <a href="#/account" onClick={handleNavClick}>Account</a>
          </>
        ) : (
          <>
            <a
              href="#/checkout"
              onClick={handleNavClick}
              className="nav-cart-inline"
              aria-label="Open cart and checkout"
              title="Checkout"
            >
              🛒
              {cartCount > 0 && (
                <span className="nav-cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
              )}
            </a>
            <a href="#/account/login" onClick={handleNavClick}>Sign In</a>
          </>
        )}
      </nav>
    </header>
  )
}
