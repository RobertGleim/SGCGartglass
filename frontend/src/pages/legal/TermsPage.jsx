import './LegalPages.css'

export default function TermsPage() {
  return (
    <main className="legal-page">
      <section className="legal-page-card">
        <h1>SGCG Terms and Conditions</h1>
        <ol className="legal-list">
          <li>
            <h2>Products, Content, and Specifications</h2>
            <p>
              SGCG strives to ensure that all information on this website is complete, accurate,
              and up to date. However, as all products are handcrafted, human and technical
              errors may occur.
            </p>
            <p>
              All features, content, specifications, products, and prices described or displayed
              on this website are subject to change at any time without notice.
            </p>
            <p>
              Please note that the color and appearance of stained glass may vary due to the
              organic nature of glass, lighting, photography, and monitor settings. We make every
              effort to accurately represent each product.
            </p>
          </li>
          <li>
            <h2>Shipping and Delivery</h2>
            <p>
              SGCG offers free standard shipping within the continental United States via USPS
              Ground. Orders shipped to Alaska and Puerto Rico will incur an additional shipping
              charge. Please contact us before completing your purchase for a quote.
            </p>
            <ul>
              <li>A tracking number will be emailed to you upon shipment.</li>
              <li>Orders valued at $200 or more may require a signature upon delivery for security.</li>
              <li>
                Please verify your shipping address carefully during checkout. SGCG is not
                responsible for lost or undeliverable packages due to incorrect addresses.
              </li>
              <li>All shipments are insured and can be tracked on www.USPS.com.</li>
            </ul>
          </li>
          <li>
            <h2>Damaged Shipments</h2>
            <p>
              In the unlikely event your order arrives damaged, please contact us within 5 days of
              receipt at <a href="mailto:Customersupport@sgcgart.com">Customersupport@sgcgart.com</a>.
            </p>
            <p>Include the following in your email:</p>
            <ol>
              <li>Name and Order Number</li>
              <li>Phone Number</li>
              <li>Shipping Address</li>
              <li>Photos of the damaged item(s) and the shipping box</li>
            </ol>
            <p>Important:</p>
            <ul>
              <li>
                Do not discard the item, packaging, or shipping materials until we confirm
                otherwise in writing.
              </li>
              <li>USPS may require an inspection before authorizing an insurance claim.</li>
              <li>Once the claim is approved, SGCG will issue a refund or replacement as appropriate.</li>
            </ul>
          </li>
          <li>
            <h2>Privacy and Security</h2>
            <p>
              Your privacy is important to us. SGCG collects personal information only to process
              and fulfill your order efficiently.
            </p>
            <p>
              We do not sell, rent, or share your personal information with third parties unless
              required by law or with your explicit consent.
            </p>
            <p>
              All payments are securely processed through Stripe, ensuring industry-standard
              encryption and security.
            </p>
          </li>
          <li>
            <h2>Ordering and Payment</h2>
            <p>Orders may be placed online through our website.</p>
            <p>We accept the following payment methods:</p>
            <ul>
              <li>Visa</li>
              <li>MasterCard</li>
              <li>American Express</li>
              <li>Discover</li>
            </ul>
            <p>
              SGCG does not offer credit terms at this time. All orders must be paid in full at
              checkout.
            </p>
          </li>
          <li>
            <h2>Order History and Invoice Copies</h2>
            <p>
              Customers who create an online account can access their order history and download
              invoice copies at any time by logging into the My Account section.
            </p>
            <p>
              If you did not create an account at the time of purchase, please contact our
              customer service team to request an invoice copy.
            </p>
          </li>
          <li>
            <h2>Updating Account Information</h2>
            <p>
              Please ensure your account information, including your shipping address and email,
              is current before placing an order.
            </p>
            <p>You can update this information at any time by logging into your account.</p>
          </li>
          <li>
            <h2>Returns and Replacements</h2>
            <p>
              Because each stained glass panel is handcrafted and made to order, returns are not
              accepted except in cases of damage during shipping (see Section 3).
            </p>
            <p>
              If you have any concerns about your order, please contact our team prior to purchase
              for clarification or assistance.
            </p>
          </li>
          <li>
            <h2>Local Pickup</h2>
            <p>Local pickup is available by appointment only.</p>
            <p>
              Please contact us to arrange a convenient pickup time after placing your order.
            </p>
          </li>
          <li>
            <h2>Contact Information</h2>
            <p>
              If you have any questions regarding these Terms or your order, please email us at{' '}
              <a href="mailto:Customersupport@sgcgart.com">Customersupport@sgcgart.com</a>.
            </p>
          </li>
        </ol>
      </section>
    </main>
  )
}
