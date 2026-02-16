import { useEffect, useMemo, useState } from 'react'

export default function useCarousel(items, options = {}) {
  const { autoplayMs = 3000, maxOffset = 2 } = options
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const totalSlides = items.length

  useEffect(() => {
    if (currentSlide >= totalSlides && totalSlides > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentSlide(0)
    }
  }, [currentSlide, totalSlides])

  useEffect(() => {
    if (!isPaused && totalSlides > 1) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % totalSlides)
      }, autoplayMs)
      return () => clearInterval(interval)
    }
  }, [autoplayMs, isPaused, totalSlides])

  const visibleSlides = useMemo(() => {
    if (!totalSlides) return []
    const max = Math.min(maxOffset, Math.floor(totalSlides / 2) || 1)
    const offsets = []
    for (let offset = -max; offset <= max; offset += 1) {
      const index = (currentSlide + offset + totalSlides) % totalSlides
      offsets.push({ offset, item: items[index], index })
    }
    return offsets
  }, [currentSlide, items, maxOffset, totalSlides])

  const nextSlide = () => {
    if (!totalSlides) return
    setCurrentSlide((prev) => (prev + 1) % totalSlides)
  }

  const prevSlide = () => {
    if (!totalSlides) return
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides)
  }

  const goToSlide = (index) => {
    setCurrentSlide(index)
  }

  return {
    currentSlide,
    isPaused,
    setIsPaused,
    totalSlides,
    visibleSlides,
    nextSlide,
    prevSlide,
    goToSlide,
  }
}
