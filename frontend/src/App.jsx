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
    try {
      const created = await createItem(authToken, value)
      setItems((prev) => [created, ...prev])
      return created
    } catch (error) {
      // Auto-logout on authentication errors (expired/invalid token)
      if (error.message.includes('token') || error.message.includes('Unauthorized')) {
        setAuthToken('')
        window.localStorage.removeItem('sgcg_token')
        throw new Error('Session expired. Please log in again.')
      }
      throw error
    }
  }

  return (
    <div className="page">
      <header className="site-header">
        <div className="logo-block">
          <img src="/logo1.jpg" alt="SGCG Art Glass logo" />
          <div>
            <p className="logo-title">{BRAND_NAME}</p>
            <p className="logo-subtitle">Handcrafted glass studio</p>
          </div>
        </div>
        <nav className="nav-links">
          <a href="#/">Home</a>
          <a href="#/product">Product</a>
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
          {!authToken ? (
            <AdminLogin onLogin={handleLogin} />
          ) : (
            <AdminDashboard
              authToken={authToken}
              items={items}
              onAddItem={handleAddItem}
              onLogout={() => {
                setAuthToken('')
                window.localStorage.removeItem('sgcg_token')
              }}
            />
          )}
        </main>
      )}

      <footer className="site-footer">
        <p>SGCG Art Glass · Etsy-connected gallery experience</p>
      </footer>
    </div>
  )
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('Signing in...')
    try {
      await onLogin(email, password)
    } catch (error) {
      setStatus('Login failed. Check credentials.')
    }
  }

  return (
    <div className="admin-login">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h2>Admin Access</h2>
        <p className="form-note">Sign in to access the dashboard.</p>
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
        {status && <p className="status-text">{status}</p>}
      </form>
    </div>
  )
}

function AdminDashboard({ items, onAddItem, onLogout }) {
  const [listingValue, setListingValue] = useState('')
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState('products')

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
      setStatus('Listing linked successfully.')
    } catch (error) {
      setStatus('Unable to link listing. Check Etsy API settings.')
    }
  }

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Admin Dashboard</h2>
          <p>Manage products and view analytics.</p>
        </div>
        <button className="button" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Products
        </button>
        <button
          className={`tab ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          Sales Stats
        </button>
        <button
          className={`tab ${activeTab === 'etsy' ? 'active' : ''}`}
          onClick={() => setActiveTab('etsy')}
        >
          Etsy Analytics
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'products' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Add Etsy Listing</h3>
              <form className="inline-form" onSubmit={handleAddItemSubmit}>
                <input
                  type="text"
                  value={listingValue}
                  onChange={(event) => setListingValue(event.target.value)}
                  placeholder="Paste Etsy listing URL or ID"
                  required
                />
                <button className="button primary" type="submit">
                  Link listing
                </button>
              </form>
              {status && <p className="status-text">{status}</p>}
            </div>

            <div className="panel-section">
              <h3>Linked Products ({items.length})</h3>
              {items.length === 0 ? (
                <div className="empty-state">No products linked yet.</div>
              ) : (
                <div className="product-list">
                  {items.map((item) => (
                    <div key={item.id} className="product-row">
                      <div className="product-thumb">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.title || 'Product'} />
                        ) : (
                          <div className="thumb-placeholder">No image</div>
                        )}
                      </div>
                      <div className="product-details">
                        <h4>{item.title || 'Untitled'}</h4>
                        <p className="product-meta">
                          {item.price_amount && `${item.price_amount} ${item.price_currency || ''}`}
                        </p>
                      </div>
                      <a
                        className="text-link"
                        href={item.etsy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on Etsy
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Sales Overview</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-label">Total Sales</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Revenue</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Avg. Order Value</p>
                  <p className="stat-value">Coming soon</p>
                </div>
              </div>
              <p className="form-note">Sales tracking will be integrated in a future update.</p>
            </div>
          </div>
        )}

        {activeTab === 'etsy' && (
          <div className="tab-panel">
            <div className="panel-section">
              <h3>Etsy Store Analytics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-label">Views</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Favorites</p>
                  <p className="stat-value">Coming soon</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Orders</p>
                  <p className="stat-value">Coming soon</p>
                </div>
              </div>
              <p className="form-note">
                Connect Etsy OAuth to pull real-time shop analytics. Rate limit: 5 QPS, 5K QPD.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
