import { useEffect, useMemo, useState } from 'react'
import './styles/App.css'
import FeaturedCarousel from './components/product/FeaturedCarousel'
import Footer from './components/layout/footer/Footer'
import Header from './components/layout/header/Header'
import HeroSection from './components/layout/hero/HeroSection'
import ProductPage from './pages/shop/ProductPage'
import ProductDetail from './pages/shop/ProductDetail'
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
import UnifiedLogin from './pages/auth/UnifiedLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import CustomerSignup from './pages/customer/CustomerSignup'
import CustomerPortal from './pages/customer/CustomerPortal'

const BRAND_NAME = 'SGCG Art Glass'

function App() {
  const route = useHashRoute()
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [manualProducts, setManualProducts] = useState([])
  const { authToken, login: loginWithCredentials, logout } = useAuth()
  const {
    customerToken,
    login: customerLogin,
    signup: customerSignup,
    logout: customerLogout,
  } = useCustomerAuth()

  useEffect(() => {
    let isActive = true
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

    fetchManualProducts()
      .then((data) => {
        if (isActive) {
          setManualProducts(data)
        }
      })
      .catch((error) => {
        console.error('Error fetching manual products:', error)
      })

    return () => {
      isActive = false
    }
  }, [])

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
    await loginWithCredentials(email, password)
  }

  const handleAddItem = async (value) => {
    try {
      const created = await createItem(authToken, value)
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

  return (
    <div className="page">
      <Header
        brandName={BRAND_NAME}
        authToken={authToken}
        customerToken={customerToken}
        route={route}
      />

      {route.path === '/' && (
        <main>
          <HeroSection />

          <section className="featured" style={{ margin: '0 auto' }}>
            <div className="section-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80px' }}>
              <h2 style={{ margin: 0, textAlign: 'center' }}>Featured items</h2>
            </div>
            <FeaturedCarousel items={featuredItems} itemsLoading={itemsLoading} />
          </section>
        </main>
      )}

      {route.path === '/product' && !route.params?.id && (
        <ProductPage products={allProducts} />
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
            return <ProductDetail product={product} />
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
              onAddItem={handleAddItem}
              onAddManualProduct={async (productData) => {
                const created = await createManualProduct(authToken, productData)
                setManualProducts((prev) => [created, ...prev])
                return created
              }}
              onUpdateManualProduct={async (id, productData) => {
                console.log('Update product called with authToken:', authToken ? `${authToken.substring(0, 20)}...` : 'NO TOKEN')
                const updated = await updateManualProduct(authToken, id, productData)
                setManualProducts((prev) => prev.map(p => p.id === id ? updated : p))
                return updated
              }}
              onDeleteManualProduct={async (id) => {
                await deleteManualProduct(authToken, id)
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

      {route.path === '/account' && (
        <main className="admin-page">
          {!customerToken ? (
            <UnifiedLogin onAdminLogin={handleLogin} onCustomerLogin={customerLogin} />
          ) : (
            <CustomerPortal manualProducts={manualProducts} />
          )}
        </main>
      )}

      <Footer />
    </div>
  )
}

export default App
