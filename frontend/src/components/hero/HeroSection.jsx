import './HeroSection.css'

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-content">
        <p className="eyebrow">Glass in motion</p>
        <h1>Gallery-worthy art glass made to glow.</h1>
        <p className="lead">
          Curated pieces from the SGCG Art Glass, brought into a
          clean, modern gallery.
        </p>
        
      </div>
      <div className="hero-panel">
        <div className="hero-card">
            <div className="card-image">
                <img src="/logo1.jpg" alt="Gallery glass art" className="image" />
            </div>
        </div>
      </div>
    </section>
  )
}
