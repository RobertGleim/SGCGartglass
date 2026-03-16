import './LegalPages.css'

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <section className="legal-page-card">
        <h1>SGCG Privacy Policy</h1>
        <p>
          Your privacy is important to us. SGCG collects personal information only to process and
          fulfill your order efficiently.
        </p>
        <p>
          We do not sell, rent, or share your personal information with third parties unless
          required by law or with your explicit consent.
        </p>
        <p>
          Payment details are processed securely through Stripe, using industry-standard encryption
          and security controls.
        </p>
        <h2>Information We Collect</h2>
        <ul>
          <li>Contact details such as name, email, phone number, and shipping address.</li>
          <li>Order details needed to fulfill purchases and provide customer support.</li>
          <li>Account information when you choose to create an online account.</li>
        </ul>
        <h2>How We Use Information</h2>
        <ul>
          <li>To process orders, send order updates, and deliver products.</li>
          <li>To provide customer service, including invoice and order history support.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <h2>Contact</h2>
        <p>
          For privacy questions, contact <a href="mailto:Customersupport@sgcgart.com">Customersupport@sgcgart.com</a>.
        </p>
      </section>
    </main>
  )
}
