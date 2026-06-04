import '../../../styles/Footer.css'

const SOCIAL_LINKS = [
  { key: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/SgCgartglass' },
  { key: 'instagram', label: 'Instagram', href: 'https://instagram.com', imageSrc: '/social/instagram-icon.svg' },
  { key: 'etsy', label: 'Etsy', href: 'https://www.etsy.com/shop/SGCGArtGlass', imageSrc: '/social/etsy-icon.svg' },
  { key: 'x', label: 'X (Twitter)', href: 'https://x.com/sgcgartglass' },
]

const renderSocialIcon = (social) => {
  if (social.key === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="footer-social-icon-svg">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#1877f2" />
        <path fill="#ffffff" d="M13.6 7.4h2.2V5h-2.2c-2.2 0-3.7 1.5-3.7 3.9v1.7H8v2.4h1.9V19h2.6v-6h2.3l.4-2.4h-2.7V9.2c0-1.2.5-1.8 1.1-1.8Z" />
      </svg>
    )
  }

  if (social.key === 'x') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="footer-social-icon-svg">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#000000" />
        <path fill="#ffffff" d="M17.75 4h-2.6l-3.4 4.6L8.4 4H3.5l5.9 8L3.5 20h2.6l3.7-5 3.7 5H18l-6.1-8.3L17.75 4Z" />
      </svg>
    )
  }

  if (social.imageSrc) {
    return (
      <img
        src={social.imageSrc}
        alt=""
        aria-hidden="true"
        className="footer-social-icon-image"
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return <span aria-hidden="true">{social.icon}</span>
}

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-social-links" aria-label="Social links">
        {SOCIAL_LINKS.map((social) => (
          <a
            key={social.key}
            className="footer-social-link"
            href={social.href}
            target="_blank"
            rel="noreferrer"
            aria-label={social.label}
            title={social.label}
          >
            {renderSocialIcon(social)}
          </a>
        ))}
      </div>
      <div className="footer-legal-links" role="navigation" aria-label="Legal links">
        <a href="#/terms">Terms of Service</a>
        <a href="#/privacy">Privacy Policy</a>
        <a href="#/custom-order-terms">Custom Order Terms</a>
        <a href="#/repair-warranty">Repair &amp; Warranty</a>
        <a href="#/faq">FAQ</a>
        <a href="#/stained-glass-guide">Stained Glass Guide</a>
      </div>
      <p>© {new Date().getFullYear()} SGCG Art</p>
    </footer>
  )
}
