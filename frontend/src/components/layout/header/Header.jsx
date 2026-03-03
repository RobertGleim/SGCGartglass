import '../../../styles/Header.css'
import { useEffect, useState } from 'react'

export default function Header({ brandName, authToken, customerToken }) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleHashChange = () => setMenuOpen(false)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleNavClick = () => {
    setMenuOpen(false)
  }

  return (
    <header className="site-header">
      <div className="logo-block">
        <img src="/logo1.jpg" alt="SGCG Art Glass logo" />
        <div>
          <p className="logo-title">{brandName}</p>
          <p className="logo-subtitle">Handcrafted Studio</p>
        </div>
      </div>
      <button className="nav-toggle" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
        <span className="nav-toggle-icon">☰</span>
      </button>
      <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
        <a href="#/" onClick={handleNavClick}>Home</a>
        <a href="#/product" onClick={handleNavClick}>Product</a>
        <a href="#/designer" onClick={handleNavClick}>Designer</a>
        {authToken ? (
          <a href="#/admin" onClick={handleNavClick}>Admin</a>
        ) : customerToken ? (
          <>
            <a href="#/my-projects" onClick={handleNavClick}>My Projects</a>
            <a href="#/account" onClick={handleNavClick}>Account</a>
          </>
        ) : (
          <a href="#/account/login" onClick={handleNavClick}>Sign In</a>
        )}
      </nav>
    </header>
  )
}
