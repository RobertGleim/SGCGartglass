import '../../../styles/Header.css'
import { useState } from 'react'

export default function Header({ brandName, authToken }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="logo-block">
        <img src="/logo1.jpg" alt="SGCG Art Glass logo" />
        <div>
          <p className="logo-title">{brandName}</p>
          <p className="logo-subtitle">Handcrafted glass studio</p>
        </div>
      </div>
      <button className="nav-toggle" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
        <span className="nav-toggle-icon">☰</span>
      </button>
      <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
        <a href="#/">Home</a>
        <a href="#/product">Product</a>
        {authToken ? (
          <a href="#/admin">Admin</a>
        ) : (
          <a href="#/admin">Sign In</a>
        )}
        {/* Future: Add customer profile link here when implemented */}
      </nav>
    </header>
  )
}
