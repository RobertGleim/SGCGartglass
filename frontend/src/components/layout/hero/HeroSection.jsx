import '../../../styles/HeroSection.css'

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-content">
        <p className="eyebrow">Art in motion</p>
        <h1>Gallery-worthy art made for your home.</h1>
        <p className="lead">
          Curated pieces from the SGCG Art, brought into a
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
