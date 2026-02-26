import React from "react";
import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <div className="legal-header">
          <Link to="/" className="legal-logo">
            <div className="auth-logo-mark">R</div>
            <span>Roadway</span>
          </Link>
        </div>

        <h1>Terms of Use</h1>
        <p className="legal-effective">Last updated: February 22, 2026</p>

        <div className="legal-content">
          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Roadway platform ("Service") operated at roadway-ai.com and
              app.roadway-ai.com, you agree to be bound by these Terms of Use ("Terms"). If you are
              using the Service on behalf of an organization, you represent that you have the authority
              to bind that organization to these Terms.
            </p>
            <p>
              If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>
              Roadway is a collaborative roadmap planning tool that allows teams to plan, visualize,
              and track product development. The Service includes:
            </p>
            <ul>
              <li>Real-time collaborative roadmap editing</li>
              <li>AI-powered features for roadmap management</li>
              <li>Third-party integrations (HubSpot, Linear, Notion)</li>
              <li>Scoring, prioritization, and analytics tools</li>
            </ul>
          </section>

          <section>
            <h2>3. Account Registration</h2>
            <ul>
              <li>You must provide accurate and complete registration information.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must notify us immediately of any unauthorized access to your account.</li>
              <li>You may not share account credentials or allow others to access your account.</li>
              <li>You must be at least 13 years old (or 16 in the EEA) to create an account.</li>
            </ul>
            <p>
              We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2>4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for any illegal purpose or in violation of any applicable law</li>
              <li>Attempt to gain unauthorized access to the Service, other accounts, or related systems</li>
              <li>Upload malicious code, viruses, or any harmful content</li>
              <li>Interfere with or disrupt the Service or other users' access</li>
              <li>Scrape, crawl, or use automated tools to extract data from the Service</li>
              <li>Impersonate any person or entity</li>
              <li>Use the Service to harm, exploit, or endanger minors</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            </ul>
          </section>

          <section>
            <h2>5. Your Content</h2>
            <p>
              <strong>You own your content.</strong> All roadmap data, cards, descriptions, comments, and
              other content you create within Roadway remains your intellectual property.
            </p>
            <p>
              <strong>License to Roadway:</strong> By using the Service, you grant us a limited,
              non-exclusive license to host, store, display, and process your content solely as necessary
              to provide and improve the Service. This includes transmitting your content to third-party
              AI providers when you use AI features (see Section 7).
            </p>
            <p>
              <strong>Roadway's intellectual property:</strong> The Service itself — including its
              design, code, branding, and documentation — is owned by Roadway and protected by
              intellectual property laws. These Terms do not grant you any rights to our intellectual
              property except the right to use the Service as intended.
            </p>
          </section>

          <section>
            <h2>6. Third-Party Integrations</h2>
            <p>
              Roadway offers integrations with third-party services including HubSpot, Linear, and
              Notion. When you connect these integrations:
            </p>
            <ul>
              <li>You authorize Roadway to access data from those services on your behalf.</li>
              <li>You are responsible for complying with the third-party service's terms of use.</li>
              <li>We store encrypted access tokens to maintain your connection.</li>
              <li>Disconnecting an integration revokes access and deletes the stored tokens.</li>
            </ul>
            <p>
              We are not responsible for the availability, accuracy, or practices of third-party
              services. Your use of integrations is at your own risk.
            </p>
          </section>

          <section>
            <h2>7. AI Features</h2>
            <p>
              Roadway includes AI-powered features provided through third-party AI services
              (Anthropic's Claude and Google's Gemini). When you use AI features:
            </p>
            <ul>
              <li>Your roadmap data may be sent to these AI providers for processing.</li>
              <li>AI outputs are for informational and suggestive purposes only.</li>
              <li><strong>No guarantee of accuracy:</strong> AI may produce inaccurate, incomplete, or unexpected results.</li>
              <li>You are responsible for reviewing and verifying any AI-generated content before acting on it.</li>
              <li>We are not liable for decisions made based on AI outputs.</li>
            </ul>
          </section>

          <section>
            <h2>8. Service Availability</h2>
            <p>
              We strive to keep Roadway available and reliable, but the Service is provided on an
              "as available" basis. We do not guarantee uninterrupted or error-free operation. We
              may perform maintenance, updates, or modifications that temporarily affect availability.
            </p>
            <p>
              We reserve the right to modify, suspend, or discontinue any part of the Service at
              any time with reasonable notice.
            </p>
          </section>

          <section>
            <h2>9. Payment and Subscriptions</h2>
            <p>
              Certain features of the Service may require a paid subscription. If applicable:
            </p>
            <ul>
              <li>Pricing and billing terms will be presented before purchase.</li>
              <li>Subscriptions renew automatically unless cancelled before the renewal date.</li>
              <li>We reserve the right to change pricing with reasonable advance notice.</li>
            </ul>
          </section>

          <section>
            <h2>10. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES INCLUDING, BUT NOT LIMITED TO, IMPLIED
              WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              We do not warrant that the Service will be uninterrupted, secure, or error-free, or
              that any AI features will produce accurate or reliable results.
            </p>
          </section>

          <section>
            <h2>11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, ROADWAY SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO
              LOSS OF DATA, REVENUE, OR BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICE.
            </p>
            <p>
              OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS OR YOUR USE OF THE SERVICE
              SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING
              THE CLAIM, OR (B) $100 USD.
            </p>
          </section>

          <section>
            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify and hold Roadway harmless from any claims, damages, losses,
              or expenses (including reasonable legal fees) arising from:
            </p>
            <ul>
              <li>Your use of the Service</li>
              <li>Your content or data</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any applicable law or third-party rights</li>
            </ul>
          </section>

          <section>
            <h2>13. Termination</h2>
            <p>
              You may stop using the Service and delete your account at any time. We may suspend or
              terminate your access if you violate these Terms or for any reason with reasonable notice.
            </p>
            <p>
              Upon termination, your right to use the Service ceases immediately. We may retain your
              data for up to 30 days to allow for recovery, after which it will be deleted. Provisions
              regarding intellectual property, liability limitations, indemnification, and governing law
              survive termination.
            </p>
          </section>

          <section>
            <h2>14. Privacy</h2>
            <p>
              Your use of the Service is also governed by our <Link to="/privacy">Privacy Policy</Link>,
              which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2>15. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes
              through the Service or by email. Your continued use of Roadway after changes are posted
              constitutes acceptance of the updated Terms. If you do not agree to the changes, you
              should stop using the Service.
            </p>
          </section>

          <section>
            <h2>16. General Provisions</h2>
            <ul>
              <li><strong>Entire agreement:</strong> These Terms, together with the Privacy Policy, constitute the entire agreement between you and Roadway.</li>
              <li><strong>Severability:</strong> If any provision of these Terms is found invalid or unenforceable, the remaining provisions remain in effect.</li>
              <li><strong>Waiver:</strong> Our failure to enforce a provision does not constitute a waiver of that provision.</li>
              <li><strong>Assignment:</strong> You may not assign your rights under these Terms without our consent. We may assign our rights at any time.</li>
            </ul>
          </section>

          <section>
            <h2>17. Contact Us</h2>
            <p>
              If you have questions about these Terms, contact us at:
            </p>
            <p>
              <strong>Email:</strong> support@roadway-ai.com<br />
              <strong>Website:</strong> roadway-ai.com
            </p>
          </section>
        </div>

        <div className="legal-footer">
          <Link to="/privacy">Privacy Policy</Link>
          <span className="legal-footer-sep">|</span>
          <Link to="/login">Sign in to Roadway</Link>
        </div>
      </div>
    </div>
  );
}
