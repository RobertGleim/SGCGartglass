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
        <line x1="7" y1="7" x2="17" y2="17" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="17" y1="7" x2="7" y2="17" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
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
      <p> ©️ SGCG Art 2026</p>
    </footer>
  )
}
