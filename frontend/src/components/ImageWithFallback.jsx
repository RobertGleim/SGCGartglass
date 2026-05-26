import { useState } from 'react'

const FALLBACK_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='90' viewBox='0 0 120 90'%3E%3Crect width='120' height='90' fill='%23e6eaf5'/%3E%3Cpath d='M45 30h30v30H45z' fill='none' stroke='%23aab0c8' stroke-width='2'/%3E%3Ccircle cx='52' cy='38' r='3' fill='%23aab0c8'/%3E%3Cpath d='M45 52l12-12 8 8 6-6 9 10H45z' fill='%23aab0c8'/%3E%3C/svg%3E`

/**
 * Renders an <img> that swaps to a neutral placeholder on load failure.
 * Accepts all standard <img> props; className, style, and alt are forwarded.
 */
export default function ImageWithFallback({ src, alt = '', fallbackSrc = FALLBACK_SVG, ...rest }) {
  const [imgSrc, setImgSrc] = useState(src || fallbackSrc)

  const handleError = () => {
    if (imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc)
    }
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={handleError}
      {...rest}
    />
  )
}
