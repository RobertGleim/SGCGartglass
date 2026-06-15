import '../../../styles/Header.css'
import { useEffect, useState } from 'react'
import { fetchCustomerCart } from '../../../services/api'
import { getGuestCartCount } from '../../../utils/guestCart'
import { getCurrentPathname } from '../../../utils/navigation'

const DEFAULT_SHOP_TAB = 'stained-glass-panels'
const BARGAIN_SHOP_TAB = 'bargain-basement'

const getStoredShopTab = () => {
  const stored = String(window.sessionStorage.getItem('sgcg_shop_tab') || '').trim()
  if (!stored) return DEFAULT_SHOP_TAB
  return stored
}

export default function Header({ authToken, customerToken }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [currentPath, setCurrentPath] = useState(getCurrentPathname)
  const [activeShopTab, setActiveShopTab] = useState(getStoredShopTab)

  useEffect(() => {
    const handleRouteChange = () => {
      setMenuOpen(false)
      const nextPath = getCurrentPathname()
      setCurrentPath(nextPath)

      if (!nextPath.startsWith('/product')) {
        setActiveShopTab(DEFAULT_SHOP_TAB)
      }
    }

    const handleShopTabChange = (event) => {
      const requested = String(event?.detail?.tab || '').trim()
      if (!requested) return
      setActiveShopTab(requested)
    }

    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('sgcg:navigation', handleRouteChange)
    window.addEventListener('sgcg-shop-tab-change', handleShopTabChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener('sgcg:navigation', handleRouteChange)
      window.removeEventListener('sgcg-shop-tab-change', handleShopTabChange)
    }
  }, [])

  const isActive = (path) => {
    if (path === '/') return currentPath === '/'
    return currentPath === path || currentPath.startsWith(path + '/')
  }

  const handleNavClick = () => {
    setMenuOpen(false)
  }

  const openShopTab = (tabKey) => {
    window.sessionStorage.setItem('sgcg_shop_tab', tabKey)
    setActiveShopTab(tabKey)
    if (getCurrentPathname().startsWith('/product')) {
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

  const handleOpenBargainBasement = () => {
    openShopTab(BARGAIN_SHOP_TAB)
  }

  const isOnProductRoute = isActive('/product')
  const isProductNavActive = isOnProductRoute && activeShopTab !== BARGAIN_SHOP_TAB
  const isBargainNavActive = isOnProductRoute && activeShopTab === BARGAIN_SHOP_TAB

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
    window.addEventListener('popstate', handleCartRefresh)
    window.addEventListener('sgcg:navigation', handleCartRefresh)
    window.addEventListener('cart-updated', handleCartRefresh)

    return () => {
      active = false
      window.removeEventListener('popstate', handleCartRefresh)
      window.removeEventListener('sgcg:navigation', handleCartRefresh)
      window.removeEventListener('cart-updated', handleCartRefresh)
    }
  }, [customerToken])

  return (
    <header className="site-header">
      <a href="/" className="logo-block" aria-label="SGCG Art Glass - Go to home">
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
        <a href="/" onClick={handleNavClick} className={isActive('/') ? 'nav-active' : undefined}>Home</a>
        <a href="/product" onClick={handleOpenProducts} className={isProductNavActive ? 'nav-active' : undefined}>Product</a>
        <a href="/product" onClick={handleOpenBargainBasement} className={`nav-bargin-basement${isBargainNavActive ? ' nav-active' : ''}`}>Bargain Basement</a>
        <a href="/reviews" onClick={handleNavClick} className={isActive('/reviews') ? 'nav-active' : undefined}>Reviews</a>
        <a href="/designer" onClick={handleNavClick} className={isActive('/designer') ? 'nav-active' : undefined}>Designer</a>
        <a href="/gallery" onClick={handleNavClick} className={isActive('/gallery') ? 'nav-active' : undefined}>Photo Gallery</a>
        {authToken ? (
          <a href="/admin" onClick={handleNavClick} className={isActive('/admin') ? 'nav-active' : undefined}>Admin</a>
        ) : customerToken ? (
          <>
            <a href="/my-projects" onClick={handleNavClick} className={isActive('/my-projects') ? 'nav-active' : undefined}>My Projects</a>
            <a
              href="/checkout"
              onClick={handleNavClick}
              className={`nav-cart-inline${isActive('/checkout') ? ' nav-active' : ''}`}
              aria-label="Open cart and checkout"
              title="Checkout"
            >
              🛒
              {cartCount > 0 && (
                <span className="nav-cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
              )}
            </a>
            <a href="/account" onClick={handleNavClick} className={isActive('/account') ? 'nav-active' : undefined}>Account</a>
          </>
        ) : (
          <>
            <a
              href="/checkout"
              onClick={handleNavClick}
              className={`nav-cart-inline${isActive('/checkout') ? ' nav-active' : ''}`}
              aria-label="Open cart and checkout"
              title="Checkout"
            >
              🛒
              {cartCount > 0 && (
                <span className="nav-cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
              )}
            </a>
            <a href="/account/login" onClick={handleNavClick} className={isActive('/account') ? 'nav-active' : undefined}>Sign In</a>
          </>
        )}
      </nav>
    </header>
  )
}
