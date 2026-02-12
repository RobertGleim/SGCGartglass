import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  createItem,
  fetchItemById,
  fetchItems,
  login,
} from './lib/api'

const BRAND_NAME = 'SGCG Art Glass'

const getRoute = () => {
  const hash = window.location.hash.replace('#', '') || '/'
  const parts = hash.split('/').filter(Boolean)
  if (parts[0] === 'product' && parts[1]) {
    return { path: '/product', params: { id: parts[1] } }
  }
  if (parts[0] === 'admin') {
    return { path: '/admin', params: {} }
  }
  return { path: '/', params: {} }
}

function App() {
  const [route, setRoute] = useState(getRoute())
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [authToken, setAuthToken] = useState(
    () => window.localStorage.getItem('sgcg_token') || ''
  )

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let isActive = true
    setItemsLoading(true)
    fetchItems()
      .then((data) => {
        if (isActive) {
          setItems(data)
        }
      })
      .finally(() => {
        if (isActive) {
          setItemsLoading(false)
        }
      })
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (route.path !== '/product') {
      setSelectedItem(null)
      return
    }
    const itemId = route.params.id
    if (!itemId) {
      setSelectedItem(null)
      return
    }
    fetchItemById(itemId).then((data) => setSelectedItem(data))
  }, [route])

  const featuredItems = useMemo(() => items.slice(0, 4), [items])

  const handleLogin = async (email, password) => {
    const token = await login(email, password)
    setAuthToken(token)
    window.localStorage.setItem('sgcg_token', token)
  }

  const handleAddItem = async (value) => {
    const created = await createItem(authToken, value)
    setItems((prev) => [created, ...prev])
    return created
  }

  return (
    <div className="page">
      <header className="site-header">
        <div className="logo-block">
          <img src="/brand-logo.svg" alt="SGCG Art Glass logo" />
          <div>
            <p className="logo-title">{BRAND_NAME}</p>
            <p className="logo-subtitle">Handcrafted glass studio</p>
          </div>
        </div>
        <nav className="nav-links">
          <a href="#/">Home</a>
          <a href="#/product">Product</a>
          <a href="#/admin">Admin</a>
        </nav>
      </header>

      {route.path === '/' && (
        <main>
          <section className="hero">
            <div className="hero-content">
              <p className="eyebrow">Glass in motion</p>
              <h1>Gallery-worthy art glass made to glow.</h1>
              <p className="lead">
                Curated pieces from the SGCG Art Glass Etsy store, brought into a
                clean, modern gallery you control.
              </p>
              <div className="hero-actions">
                <a className="button primary" href="#/product">
                  View featured piece
                </a>
                <a className="button ghost" href="#/admin">
                  Manage inventory
                </a>
              </div>
            </div>
            <div className="hero-panel">
              <div className="hero-card">
                <p className="hero-label">Etsy synced</p>
                <h3>Automatic detail pulls</h3>
                <p>
                  Link a listing and the image, description, and price stay in
                  lockstep with your shop.
                </p>
              </div>
            </div>
          </section>

          <section className="featured">
            <div className="section-header">
              <h2>Featured items</h2>
              <p>Highlight the newest and most loved glasswork.</p>
            </div>
            {itemsLoading ? (
              <div className="empty-state">Loading featured items...</div>
            ) : featuredItems.length === 0 ? (
              <div className="empty-state">
                No Etsy items linked yet. Add listings from the admin page.
              </div>
            ) : (
              <div className="featured-grid">
                {featuredItems.map((item) => (
                  <article key={item.id} className="product-card">
                    <div className="card-image">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title || 'Glass art'} />
                      ) : (
                        <div className="image-placeholder">No image</div>
                      )}
                    </div>
                    <div className="card-body">
                      <h3>{item.title || 'Untitled piece'}</h3>
                      <p className="card-description">
                        {item.description || 'Details will appear after Etsy sync.'}
                      </p>
                      <div className="card-meta">
                        <span className="price">
                          {item.price_amount || '--'}
                          {item.price_currency ? ` ${item.price_currency}` : ''}
                        </span>
                        <a className="text-link" href={`#/product/${item.id}`}>
                          View
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {route.path === '/product' && (
        <main className="product-page">
          <section className="section-header">
            <h2>Featured product</h2>
            <p>Spotlight a single listing with rich detail.</p>
          </section>
          {!route.params.id && (
            <div className="empty-state">
              Select a product from the featured list to see the full page.
            </div>
          )}
          {route.params.id && !selectedItem && (
            <div className="empty-state">Loading product details...</div>
          )}
          {selectedItem && (
            <div className="product-detail">
              <div className="product-image">
                {selectedItem.image_url ? (
                  <img
                    src={selectedItem.image_url}
                    alt={selectedItem.title || 'Glass art'}
                  />
                ) : (
                  <div className="image-placeholder">No image</div>
                )}
              </div>
              <div className="product-info">
                <h2>{selectedItem.title || 'Untitled piece'}</h2>
                <p className="price">
                  {selectedItem.price_amount || '--'}
                  {selectedItem.price_currency ? ` ${selectedItem.price_currency}` : ''}
                </p>
                <p className="card-description">
                  {selectedItem.description || 'Details will appear after Etsy sync.'}
                </p>
                {selectedItem.etsy_url && (
                  <a className="button primary" href={selectedItem.etsy_url}>
                    View on Etsy
                  </a>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {route.path === '/admin' && (
        <main className="admin-page">
          <section className="section-header">
            <h2>Admin control</h2>
            <p>Link Etsy listings and keep featured items current.</p>
          </section>
          <AdminPanel
            onLogin={handleLogin}
            onAddItem={handleAddItem}
            isAuthed={Boolean(authToken)}
          />
        </main>
      )}

      <footer className="site-footer">
        <p>SGCG Art Glass · Etsy-connected gallery experience</p>
      </footer>
    </div>
  )
}

function AdminPanel({ onLogin, onAddItem, isAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [listingValue, setListingValue] = useState('')
  const [status, setStatus] = useState('')

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setStatus('Signing in...')
    try {
      await onLogin(email, password)
      setStatus('Signed in. Ready to add listings.')
    } catch (error) {
      setStatus('Login failed. Check credentials.')
    }
  }

  const handleAddItemSubmit = async (event) => {
    event.preventDefault()
    if (!listingValue) {
      setStatus('Enter an Etsy listing URL or ID.')
      return
    }
    setStatus('Linking listing...')
    try {
      await onAddItem(listingValue)
      setListingValue('')
      setStatus('Listing linked.')
    } catch (error) {
      setStatus('Unable to link listing. Check Etsy API settings.')
    }
  }

  return (
    <div className="admin-panel">
      <form className="card" onSubmit={handleLoginSubmit}>
        <h3>Admin sign-in</h3>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            required
          />
        </label>
        <button className="button primary" type="submit">
          Sign in
        </button>
      </form>

      <form className="card" onSubmit={handleAddItemSubmit}>
        <h3>Link Etsy listing</h3>
        <label>
          Etsy listing URL or ID
          <input
            type="text"
            value={listingValue}
            onChange={(event) => setListingValue(event.target.value)}
            placeholder="https://www.etsy.com/listing/123456789/"
            required
          />
        </label>
        <button className="button" type="submit" disabled={!isAuthed}>
          Add listing
        </button>
        {!isAuthed && (
          <p className="form-note">Sign in first to enable listing sync.</p>
        )}
      </form>

      <p className="status-text">{status}</p>
    </div>
  )
}

export default App
