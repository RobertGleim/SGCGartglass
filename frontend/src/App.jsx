import { useEffect, useMemo, useState } from 'react'
import './App.css'
import FeaturedCarousel from './components/FeaturedCarousel'
import Footer from './components/footer/Footer'
import Header from './components/header/Header'
import HeroSection from './components/hero/HeroSection'
import ProductPage from './views/ProductPage'
import useHashRoute from './hooks/useHashRoute'
import useAuth from './hooks/useAuth'
import {
  createItem,
  fetchItems,
  fetchManualProducts
} from './config/api'
import AdminLogin from './views/admin/AdminLogin'
import AdminDashboard from './views/admin/AdminDashboard'

const BRAND_NAME = 'SGCG Art Glass'

function App() {
  const route = useHashRoute()
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [manualProducts, setManualProducts] = useState([])
  const { authToken, login: loginWithCredentials, logout } = useAuth()

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
      <Header brandName={BRAND_NAME} authToken={authToken} route={route} />

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

      {route.path === '/product' && (
        <ProductPage products={allProducts} />
      )}

      {route.path === '/admin' && (
        <main className="admin-page">
          {!authToken ? (
            <AdminLogin onLogin={handleLogin} />
          ) : (
            <AdminDashboard
              items={items}
              manualProducts={manualProducts}
              onAddItem={handleAddItem}
              onAddManualProduct={async (productData) => {
                const { createManualProduct } = await import('./config/api')
                const created = await createManualProduct(authToken, productData)
                setManualProducts((prev) => [created, ...prev])
                return created
              }}
              onUpdateManualProduct={async (id, productData) => {
                const { updateManualProduct } = await import('./config/api')
                const updated = await updateManualProduct(authToken, id, productData)
                setManualProducts((prev) => prev.map(p => p.id === id ? updated : p))
                return updated
              }}
              onDeleteManualProduct={async (id) => {
                const { deleteManualProduct } = await import('./config/api')
                await deleteManualProduct(authToken, id)
                setManualProducts((prev) => prev.filter(p => p.id !== id))
              }}
              onLogout={logout}
            />
          )}
        </main>
      )}

      <Footer />
    </div>
  )
}

export default App
