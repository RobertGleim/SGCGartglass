import './LegalPages.css'

export default function RepairWarrantyPage() {
  return (
    <main className="legal-page">
      <section className="legal-page-card">
        <h1>Repair &amp; Warranty Policy</h1>
        <p><strong>Effective Date:</strong> April 21, 2026</p>

        <h2>Warranty Coverage</h2>
        <p>SGCG Art offers limited repair support for craftsmanship defects only.</p>

        <h2>What Is Covered</h2>
        <ul>
          <li>Structural defects caused by craftsmanship</li>
          <li>Issues identified shortly after delivery</li>
        </ul>

        <h2>What Is Not Covered</h2>
        <ul>
          <li>Damage caused by improper handling</li>
          <li>Accidental damage after delivery</li>
          <li>Normal wear and tear</li>
          <li>Damage from environmental exposure</li>
        </ul>

        <h2>Repair Requests</h2>
        <p>Customers must contact SGCG Art with photos and a description of the issue.</p>

        <h2>Shipping for Repairs</h2>
        <p>
          Customers are responsible for shipping costs unless the issue is determined to be a
          craftsmanship defect.
        </p>

        <h2>Limitations</h2>
        <p>Repairs or replacements are provided at the sole discretion of SGCG Art.</p>

        <h2>Contact</h2>
        <p>
          Email: <a href="mailto:customersupport@sgcgart.com">customersupport@sgcgart.com</a>
        </p>
      </section>
    </main>
  )
}