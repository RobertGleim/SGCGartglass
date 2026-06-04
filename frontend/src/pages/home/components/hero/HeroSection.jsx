import './HeroSection.css'
import AppDownloadSection from '../../../../components/AppDownloadSection'

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-content">
        <p className="eyebrow">Art in motion</p>
        <h1>Gallery-worthy art made for your home.</h1>
        <p className="lead">
          Handcrafted stained glass, fused art, and wood pieces — made in the USA and brought into a clean, modern gallery.
        </p>
        <div className="hero-actions">
          <a href="#/product" className="button hero-btn-primary">Shop Now</a>
          <a href="#/gallery" className="button hero-btn-secondary">View Gallery</a>
        </div>
      </div>
      <div className="hero-panel">
        <div className="hero-card">
          <div className="hero-box hero-box-image">
            <div className="card-image">
              <img src="/logo.png" alt="SGCG Art Glass logo" className="image" />
            </div>
          </div>
          <div className="hero-box hero-box-download">
            <AppDownloadSection variant="heroCardBox" />
          </div>
          <div className="hero-box hero-box-qr">
            <img src="/qrblack2.png" alt="Scan to open SGCG Art on your phone" className="hero-qr" />
            <p className="hero-qr-label">Scan to open on phone</p>
          </div>
        </div>
      </div>
    </section>
  )
}
