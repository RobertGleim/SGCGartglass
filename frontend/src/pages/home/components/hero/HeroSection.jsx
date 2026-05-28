import './HeroSection.css'

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
      <div className="hero-pa