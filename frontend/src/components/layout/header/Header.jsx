import '../../../styles/Header.css'
import { useEffect, useState } from 'react'
import { fetchCustomerCart } from '../../../services/api'
import { getGuestCartCount } from '../../../utils/guestCart'

const getHashPath = () => {
  const hash = String(window.location.hash || '#/')
  // strip query params and trailing slashes for matching
  return hash.replace(/\?.*$/, '').replace(/\/$/, '') || '#/'
}

export default function Header({ brandName, authToken, customerToken }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [hashPath, setHashPath] = useState(getHashPath)

  useEffect(() => {
    const handleHashChange = () => {
      setMenuOpen(false)
      setHashPath(getHashPath())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const isActive = (path) => {
    if (path === '#/') return hashPath === '#/'
    return hashPath === path || hashPath.startsWith(path + '/')
  }

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

  const handleOpenBargainBasement = () => {
    openShopTab('bargain-basement')
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
        <a href="#/" onClick={handleNavClick} className={isActive('#/') ? 'nav-active' : undefined}>Home</a>
        <a href="#/product" onClick={handleOpenProducts} className={isActive('#/product') ? 'nav-active' : undefined}>Product</a>
        <a href="#/product" onClick={handleOpenBargainBasement} className={`nav-bargin-basement${isActive('#/product') ? ' nav-active' : ''}`}>Bargain Basement</a>
        <a href="#/reviews" onClick={handleNavClick} className={isActive('#/reviews') ? 'nav-active' : undefined}>Reviews</a>
        <a href="#/designer" onClick={handleNavClick} className={isActive('#/designer') ? 'nav-active' : undefined}>Designer</a>
        <a href="#/gallery" onClick={handleNavClick} className={isActive('#/gallery') ? 'nav-active' : undefined}>Photo Gallery</a>
        {authToken ? (
          <a href="#/admin" onClick={handleNavClick} className={isActive('#/admin') ? 'nav-active' : undefined}>Admin</a>
        ) : customerToken ? (
          <>
            <a href="#/my-projects" onClick={handleNavClick} className={isActive('#/my-projects') ? 'nav-active' : undefined}>My Projects</a>
            <a
              href="#/checkout"
              onClick={handleNavClick}
              className={`nav-cart-inline${isActive(