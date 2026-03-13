import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import './styles/App.css'
import Footer from './components/layout/footer/Footer'
import Header from './components/layout/header/Header'
import LoadingMessage from './components/LoadingMessage'
import useHashRoute from './hooks/useHashRoute'
import useAuth from './hooks/useAuth'
import useCustomerAuth from './hooks/useCustomerAuth'
import {
  createItem,
  createManualProduct,
  updateManualProduct,
  deleteManualProduct,
  fetchItems,
  fetchManualProducts
} from './services/api'

const HomePage = lazy(() => import('./pages/home/HomePage'))

const ProductPage = lazy(() => import('./pages/shop/ProductPage'))
const ProductDetail = lazy(() => import('./pages/shop/ProductDetail'))
const ReviewsPage = lazy(() => import('./pages/shop/ReviewsPage'))
const CheckoutPage = lazy(() => import('./pages/shop/CheckoutPage'))
const CheckoutSuccessPage = lazy(() => import('./pages/shop/CheckoutSuccessPage'))
const UnifiedLogin = lazy(() => import('./pages/auth/UnifiedLogin'))
const CustomerResetPassword = lazy(() => import('./pages/auth/CustomerResetPassword'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const CustomerSignup = lazy(() => import('./pages/customer/CustomerSignup'))
const CustomerPortal = lazy(() => import('./pages/customer/CustomerPortal'))
const DesignerPage = lazy(() => import('./pages/DesignerPage'))
const MyProjectsPage = lazy(() => import('./pages/MyProjectsPage'))
const MyWorkOrdersPage = lazy(() => import('./pages/MyWorkOrdersPage'))
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage'))
const PhotoGalleryPage = lazy(() => import('./pages/PhotoGalleryPage'))

const BRAND_NAME = 'SGCG Art'
const CATALOG_CACHE_KEY = 'sgcg_catalog_cache_v2'
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000

const readCatalogCache = () => {
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const items = Array.isArray(parsed.items) ? parsed.items : []
    const manualProducts = Array.isArray(parsed.manualProducts) ? parsed.manualProducts : []
    const ts = Number(parsed.ts || 0)
    const isFresh = Number.isFinite(ts) && Date.now() - ts < CATALOG_CACHE_TTL_MS
    const hasContent = items.length > 0 || manualProducts.length > 0
    return { items, manualProducts, ts, isFresh, hasContent }
  } catch {
    return null
  }
}

const writeCatalogCache = (items, manualProducts) => {
  try {
    window.localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        items: Array.isArray(items) ? items : [],
        manualProducts: Array.isArray(manualProducts) ? manualProducts : [],
      }),
    )
  } catch {
    // Ignore quota/private mode errors.
  }
}

function App() {
  const route = useHashRoute()
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [manualProducts, setManualProducts] = useState([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [catalogRetryTick, setCatalogRetryTick] = useState(0)
  const { authToken, login: loginWithCredentials, logout } = useAuth()
  const {
    customerToken,
    login: customerLogin,
    signup: customerSignup,
    // eslint-disable-next-line no-unused-vars
    logout: customerLogout,
  } = useCustomerAuth()

  useEffect(() => {
    const needsCatalog = ['/', '/product', '/admin', '/account'].includes(route.path)
    if (!needsCatalog || catalogLoaded) {
      return undefined
    }

    let isActive = true
    let retryTimerId = null
    const cached = readCatalogCache()

    if (cached?.hasContent) {
      setItems(cached.items)
      setManualProducts(cached.manualProducts)
      setCatalogLoaded(true)
      setItemsLoading(false)
    } else {
      setItemsLoading(true)
    }

    if (cached?.isFresh && cached?.hasContent) {
      return () => {
        isActive = false
      }
    }

    Promise.allSettled([fetchItems(), fetchManualProducts({ summary: 1 })])
      .then(([itemsResult, manualResult]) => {
        if (!isActive) return

        const nextItems = itemsResult.status === 'fulfilled'
          ? (Array.isArray(itemsResult.value) ? itemsResult.value : [])
          : null
        const nextManual = manualResult.status === 'fulfilled'
          ? (Array.isArray(manualResult.value) ? manualResult.value : [])
          : null

        if (nextItems !== null) {
          setItems(nextItems)
        } else {
          console.error('Error fetching items:', itemsResult.reason)
        }

        if (nextManual !== null) {
          setManualProducts(nextManual)
        } else {
          console.error('Error fetching manual products:', manualResult.reason)
        }

        const hasAnySuccess = nextItems !== null || nextManual !== null
        if (hasAnySuccess) {
          const cacheItems = nextItems !== null ? nextItems : (cached?.items || [])
          const cacheManual = nextManual !== null ? nextManual : (cached?.manualProducts || [])
          writeCatalogCache(cacheItems, cacheManual)
          setCatalogLoaded(true)
        } else {
          // Avoid getting stuck on an empty page after transient proxy/network failures.
          setCatalogLoaded(false)
          retryTimerId = window.setTimeout(() => {
            if (isActive) setCatalogRetryTick((prev) => prev + 1)
          }, 1200)
        }
      })
      .finally(() => {
        if (isActive) {
          setItemsLoading(false)
        }
      })

    return () => {
      isActive = false
      if (retryTimerId) {
        window.clearTimeout(retryTimerId)
      }
    }
  }, [route.path, catalogLoaded, catalogRetryTick])

  useEffect(() => {
    if (!catalogLoaded) return
    writeCatalogCache(items, manualProducts)
  }, [items, manualProducts, catalogLoaded])

  // Scroll to top whenever route changes
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path, route.params?.id])

  const allProducts = useMemo(() => {
    const manualItems = manualProducts.map(p => ({
      id: `m-${p.id}`,
      title: p.name,
      description: p.description,
      price_amount: p.price,
      old_price: p.old_price,
      discount_percent: p.discount_percent,
      price_currency: 'USD',
      image_url: p.images?.[0]?.image_url,
      category: p.category,
      isManual: true,
      is_featured: p.is_featured === 1 || p.is_featured === true,
      originalData: p
    }))
    return [...manualItems, ...items]
  }, [items, manualProducts])

  const featuredItems = useMemo(() => {
    const featured = allProducts.filter(p => p.is_featured)
    const nonFeatured = allProducts.filter(p => !p.is_featured)
    return [...featured, ...nonFeatured].slice(0, 8)
  }, [allProducts])

  const handleLogin = async (email, password) => {
    const token = await loginWithCredentials(email, password)
    const persisted = window.localStorage.getItem('sgcg_token') || ''
    if (!token && !persisted) {
      throw new Error('Login failed: no token returned')
    }
    // Use full hash navigation so hosted builds reliably switch views immediately
    window.location.assign('/#/admin')
  }

  const handleAddItem = async (value) => {
    try {
      const created = await createItem(value)
      setItems((prev) => [created, ...prev])
      return created
    } catch (error) {
      if (error.message.includes('token') || error.message.includes('Unauthorized')) {
        logout()
        throw new Error('Session expired. Please log in again.')
      }
      throw error
    }
  }

  const handleRefreshCatalog = async () => {
    setItemsLoading(true)
    try {
      const [itemsResult, manualResult] = await Promise.allSettled([
        fetchItems(),
        fetchManualProducts({ summary: 1 }),
      ])

      if (itemsResult.status !== 'fulfilled') {
        throw itemsResult.reason || new Error('Unable to refresh linked items.')
      }
      if (manualResult.status !== 'fulfilled') {
        throw manualResult.reason || new Error('Unable to refresh manual products.')
      }

      const nextItems = Array.isArray(itemsResult.value) ? itemsResult.value : []
      const nextManual = Array.isArray(manualResult.value) ? manualResult.value : []

      setItems(nextItems)
      setManualProducts(nextManual)
      writeCatalogCache(nextItems, nextManual)
      setCatalogLoaded(true)
      return { items: nextItems, manualProducts: nextManual }
    } finally {
      setItemsLoading(false)
    }
  }

  return (
    <div className="page">
      <Header
        brandName={BRAND_NAME}
        authToken={authToken}
        customerToken={customerToken}
        route={route}
      />

      <Suspense fallback={<main className="admin-page"><div style={{ padding: '1.5rem' }}><LoadingMessage label="Loading" /></div></main>}>
        {route.path === '/' && (
          <HomePage featuredItems={featuredItems} itemsLoading={itemsLoading} />
        )}

        {route.path === '/product' && !route.params?.id && (
          <ProductPage products={allProducts} />
        )}

        {route.path === '/reviews' && (
          <ReviewsPage />
        )}

        {route.path === '/product' && route.params?.id && (
          <main className="product-detail-page">
            {(() => {
              const product = allProducts.find(p => String(p.id) === String(route.params.id))
              if (!product) {
                return (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <h2>Product not found</h2>
                    <p>The product you're looking for doesn't exist.</p>
                    <a href="#/product" style={{ color: '#1a1a1a', textDecoration: 'underline' }}>
                      Back to shop
                    </a>
                  </div>
                )
              }
              return <ProductDetail product={product} products={allProducts} />
            })()}
          </main>
        )}

        {route.path === '/admin' && (
          <main className="admin-page">
            {!authToken ? (
              <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
            ) : (
              <AdminDashboard
                items={items}
                manualProducts={manualProducts}
                onRefreshCatalog={handleRefreshCatalog}
                onAddItem={handleAddItem}
                onAddManualProduct={async (productData) => {
                  const created = await createManualProduct(productData)
                  setManualProducts((prev) => [created, ...prev])
                  return created
                }}
                onUpdateManualProduct={async (id, productData) => {
                  const updated = await updateManualProduct(id, productData)
                  setManualProducts((prev) => prev.map(p => p.id === id ? updated : p))
                  return updated
                }}
                onDeleteManualProduct={async (id) => {
                  await deleteManualProduct(id)
                  setManualProducts((prev) => prev.filter(p => p.id !== id))
                }}
                onLogout={logout}
              />
            )}
          </main>
        )}

        {route.path === '/account/login' && (
          <main className="admin-page">
            <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
          </main>
        )}

        {route.path === '/account/signup' && (
          <main className="admin-page">
            <CustomerSignup onSignup={customerSignup} />
          </main>
        )}

        {route.path === '/account/reset-password' && (
          <main className="admin-page">
            <CustomerResetPassword />
          </main>
        )}

        {route.path === '/account' && (
          <main className="admin-page">
            {!customerToken ? (
              <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
            ) : (
              <CustomerPortal manualProducts={manualProducts} />
            )}
          </main>
        )}

        {route.path === '/designer' && (
          <main>
            <DesignerPage />
          </main>
        )}

        {route.path === '/gallery' && (
          <main>
            <PhotoGalleryPage />
          </main>
        )}

        {route.path === '/checkout' && (
          <main>
            {!customerToken ? (
              <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
            ) : (
              <CheckoutPage />
            )}
          </main>
        )}

        {route.path === '/checkout/success' && (
          <main>
            <CheckoutSuccessPage />
          </main>
        )}

        {route.path === '/my-projects' && (
          <main>
            {!customerToken ? (
              <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
            ) : (
              <MyProjectsPage />
            )}
          </main>
        )}

        {route.path === '/my-work-orders' && (
          <main>
            {!customerToken ? (
              <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
            ) : (
              <MyWorkOrdersPage />
            )}
          </main>
        )}

        {route.path === '/diagnostics' && (
          <main>
            <DiagnosticsPage />
          </main>
        )}
      </Suspense>

      <Footer />
    </div>
  )
}

export default App
