import './LegalPages.css'

export default function FaqPage() {
  return (
    <main className="legal-page">
      <section className="legal-page-card">
        <h1>SGCG Art - Frequently Asked Questions (FAQ)</h1>
        <ol className="legal-list">
          <li>
            <h2>What is SGCG Art?</h2>
            <p>
              SGCG Art specializes in handcrafted stained glass artwork, including geometric
              panels, beveled glass designs, and nature-inspired pieces. Each item is made with
              craftsmanship and attention to creative detail.
            </p>
          </li>
          <li>
            <h2>What types of stained glass do you offer?</h2>
            <p>The site features a variety of stained glass designs, such as:</p>
            <ul>
              <li>Beveled glass panels</li>
              <li>Geometric patterns</li>
              <li>Nature-inspired art (for example, Tree of Life)</li>
              <li>Custom-sized glass pieces</li>
            </ul>
          </li>
          <li>
            <h2>Are your stained glass artworks handmade?</h2>
            <p>
              Yes, all stained glass art listed on SGCG Art is handcrafted by skilled artisans,
              ensuring each piece is unique.
            </p>
          </li>
          <li>
            <h2>Can I request a custom design or alteration?</h2>
            <p>
              SGCG Art allows for customization requests, such as size changes or color
              adjustments. Certain color substitutions (like replacing unavailable glass pieces)
              are sometimes made while maintaining a consistent design theme.
            </p>
          </li>
          <li>
            <h2>Max size I can get?</h2>
            
            <ul>
              <li>Square panels: up to 34" x 34"</li>
              <li>Rectangular panels: up to 48" x 24"</li>
              <li>Transom: 60" x 12"</li>
              <p> These sizes represent the maximum dimensions for each panel type. Please contact SGCG Art if you have any questions about a certain size.</p>
            </ul>
            <p>Custom sizes may also be available upon request.</p>
          </li>
          <li>
            <h2>How much do your stained glass pieces cost?</h2>
            <p>Prices vary depending on size, complexity, and materials used.</p>
            
          </li>
          <li>
            <h2>What materials are used in SGCG Art pieces?</h2>
            <p>
              SGCG Art uses high-quality beveled glass, stained and textured glass (frosted,
              rippled, seedy), and metal framing (like zinc or lead came) for structure and
              durability.
            </p>
          </li>
          <li>
            <h2>How are the glass artworks shipped?</h2>
            <p>
              Each piece is securely packaged with protective materials to prevent damage during
              shipping. Tracking and shipping timelines are available at checkout.
            </p>
          </li>
          <li>
            <h2>Do you offer returns or exchanges?</h2>
            <p>
              Most stained glass pieces are made-to-order. Returns may be limited, especially for
              custom orders, but damaged or defective items can typically be replaced. Customers
              should review the specific policy at checkout or contact support.
            </p>
          </li>
          <li>
            <h2>How do I care for my stained glass art?</h2>
            <p>To maintain your piece:</p>
            <ul>
              <li>Clean gently with a soft cloth</li>
              <li>Avoid abrasive cleaners or alcohol-based sprays</li>
              <li>Keep it out of direct heat or moisture for long periods</li>
            </ul>
          </li>
          <li>
            <h2>Where can I view all products?</h2>
            <p>
              You can browse all available artworks and detailed photos at{' '}
              <a href="https://sgcgart.com/" target="_blank" rel="noreferrer">
                https://sgcgart.com/
              </a>
              .
            </p>
          </li>
          <li>
            <h2>How do I contact SGCG Art?</h2>
            <p>
              You can reach out via the Contact or Support section on the website or through email
              for inquiries about orders or custom designs.
            </p>
          </li>
        </ol>

        <div className="legal-secondary-link-group" aria-label="Additional reading">
          <p className="legal-secondary-link-label">Additional reading</p>
          <a className="legal-secondary-link" href="/stained-glass-guide">
            Stained Glass Guide
          </a>
        </div>
      </section>
    </main>
  )
}
