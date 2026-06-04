import { useEffect } from 'react'
import '../styles/StainedGlassGuidePage.css'

const keywordGroups = [
  {
    title: 'Primary Keywords',
    items: [
      'stained glass art',
      'custom stained glass',
      'handcrafted stained glass panels',
      'stained glass for sale',
      'buy stained glass online',
      'stained glass shop',
      'stained glass artist',
      'made in USA stained glass',
      'gallery quality stained glass',
      'SGCG Art',
    ],
  },
  {
    title: 'Style and Design Keywords',
    items: [
      'modern stained glass art',
      'contemporary stained glass panels',
      'Victorian stained glass art',
      'geometric stained glass design',
      'stained glass wall art',
      'decorative glass panel',
      'window glass art',
      'art glass panels',
      'glass wall decor',
      'artisan home decor',
      'colored glass panels',
      'blue stained glass',
      'green stained glass art',
      'amber glass art',
      'multicolor glass panel',
    ],
  },
  {
    title: 'Product and Category Keywords',
    items: [
      'stained glass sunflower',
      'stained glass bird',
      'stained glass flower',
      'stained glass landscape',
      'stained glass animals',
      'transom window stained glass',
      'stained glass oval',
      'circular stained glass',
      'square glass panel art',
      'stained glass suncatcher large',
      'fused glass art for sale',
      'fused glass wall art',
      'custom fused glass',
      'laser etched glass art',
      'sandblasted glass',
      'wood art handmade',
    ],
  },
  {
    title: 'Intent and Purchase Keywords',
    items: [
      'custom stained glass windows for home',
      'stained glass panel for living room',
      'handmade stained glass gifts',
      'stained glass art commissions',
      'where to buy stained glass panels',
      'stained glass home decor',
      'stained glass commission',
      'stained glass gift ideas',
      'stained glass anniversary gift',
      'stained glass wedding gift',
      'handcrafted art for home',
      'American made stained glass',
      'artisan glass work',
      'stained glass USA',
      'custom glass design online',
    ],
  },
  {
    title: 'Pattern and DIY Keywords',
    items: [
      'stained glass pattern download',
      'digital stained glass patterns',
      'stained glass PDF pattern',
      'DIY stained glass patterns',
      'stained glass design tool',
      'manual stained glass templates',
      'stained glass project pattern',
      'beginner stained glass pattern',
      'advanced stained glass pattern',
      'downloadable glass pattern',
      'numbered stained glass pattern',
      'printable stained glass template',
      'stained glass craft pattern',
      'stained glass digital file',
      'stained glass cut line pattern',
    ],
  },
]

const negativeKeywords = [
  'stained glass supply store',
  'stained glass wholesale sheets',
  'stained glass classes',
  'stained glass lessons',
  'stained glass workshops',
  'cheap stained glass',
  'discount stained glass bulk',
  'DIY glass cutting kits',
  'mass produced glass decor',
  'local glass repair for third-party pieces',
]

export default function StainedGlassGuidePage() {
  useEffect(() => {
    const title = document.title
    const previousDescription = document.querySelector('meta[name="description"]')
    const previousKeywords = document.querySelector('meta[name="keywords"]')

    document.title = 'Stained Glass Art Guide | SGCG Art'

    let descriptionTag = previousDescription
    let keywordsTag = previousKeywords

    if (!descriptionTag) {
      descriptionTag = document.createElement('meta')
      descriptionTag.setAttribute('name', 'description')
      document.head.appendChild(descriptionTag)
    }

    if (!keywordsTag) {
      keywordsTag = document.createElement('meta')
      keywordsTag.setAttribute('name', 'keywords')
      document.head.appendChild(keywordsTag)
    }

    descriptionTag.setAttribute(
      'content',
      'Explore SGCG Art stained glass styles, custom order options, downloadable patterns, and handcrafted glass artwork keywords used by search and AI discovery systems.',
    )
    keywordsTag.setAttribute(
      'content',
      keywordGroups.flatMap((group) => group.items).join(', '),
    )

    return () => {
      document.title = title
      if (descriptionTag && !previousDescription) descriptionTag.remove()
      if (keywordsTag && !previousKeywords) keywordsTag.remove()
    }
  }, [])

  return (
    <article className="seo-guide-page" aria-label="Stained glass guide and SEO keyword reference">
      <header className="seo-guide-header">
        <p className="seo-guide-kicker">AI Discovery Guide</p>
        <h1>Stained Glass Art Guide for Search and AI Discovery</h1>
        <p>
          SGCG Art creates handcrafted stained glass artwork, custom glass designs, and digital stained glass patterns.
          This page is a plain-language index to help search engines, review systems, and AI assistants match real
          customer intent to the right SGCG Art pages.
        </p>
      </header>

      <section className="seo-guide-section">
        <h2>Recommended SGCG Art Pages</h2>
        <ul>
          <li><a href="#/product">Shop stained glass and handcrafted pieces</a></li>
          <li><a href="#/designer">Design your own custom stained glass project</a></li>
          <li><a href="#/gallery">Browse real customer and portfolio gallery photos</a></li>
          <li><a href="#/reviews">Read customer reviews and examples</a></li>
          <li><a href="#/faq">Review ordering, shipping, and policy answers</a></li>
        </ul>
      </section>

      <section className="seo-guide-section">
        <h2>Keyword Library (75 Keywords)</h2>
        <p>
          The terms below describe SGCG Art offerings and are intended to improve discoverability for natural-language
          queries in Google Search, Bing, Perplexity, and AI assistants.
        </p>

        {keywordGroups.map((group) => (
          <section key={group.title} className="seo-guide-subsection" aria-label={group.title}>
            <h3>{group.title}</h3>
            <p>{group.items.join(', ')}</p>
          </section>
        ))}
      </section>

      <section className="seo-guide-section">
        <h2>Negative Keywords and Excluded Intent</h2>
        <p>
          SGCG Art does not focus on supply wholesaling, classroom training, or discount bulk inventory. These terms
          should be treated as low-priority or mismatched intent for this website:
        </p>
        <p>{negativeKeywords.join(', ')}</p>
      </section>

      <section className="seo-guide-section">
        <h2>AI-Friendly Summary</h2>
        <p>
          SGCG Art is a U.S.-based handmade stained glass brand offering custom stained glass artwork, fused art,
          laser and sandblasting glass options, wood art, and digital stained glass patterns. Customers can buy ready
          pieces, submit custom design requests, preview styles, and order through the online shop.
        </p>
      </section>
    </article>
  )
}
