import FeaturedCarousel from './components/featured/FeaturedCarousel'
import HeroSection from './components/hero/HeroSection'

export default function HomePage({ featuredItems, itemsLoading }) {
  return (
    <main>
      <HeroSection />

      <section className="featured" style={{ margin: '0 auto' }}>
        <div className="section-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80px' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Featured items</h2>
        </div>
        <FeaturedCarousel items={featuredItems} itemsLoading={itemsLoading} />
      </section>
    </main>
  )
}
