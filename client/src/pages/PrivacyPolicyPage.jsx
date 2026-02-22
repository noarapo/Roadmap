import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <div className="legal-header">
          <Link to="/" className="legal-logo">
            <div className="auth-logo-mark">R</div>
            <span>Roadway</span>
          </Link>
        </div>

        <h1>Privacy Policy</h1>
        <p className="legal-effective">Last updated: February 22, 2026</p>

        <div className="legal-content">
          <section>
            <h2>1. Introduction</h2>
            <p>
              Roadway ("we," "us," or "our") operates the roadmap planning platform available at
              roadway-ai.com and app.roadway-ai.com (the "Service"). This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you use our Service.
            </p>
            <p>
              By using Roadway, you agree to the collection and use of information in accordance
              with this policy. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>

            <h3>a) Information You Provide</h3>
            <ul>
              <li><strong>Account data:</strong> Name, email address, and password (stored as a secure hash) when you register.</li>
              <li><strong>Roadmap content:</strong> Cards, sprints, rows, descriptions, comments, scores, and other data you create within the Service.</li>
              <li><strong>Workspace information:</strong> Team names, workspace settings, and collaboration preferences.</li>
            </ul>

            <h3>b) Information from Google Sign-In</h3>
            <p>
              If you sign in with Google, we receive your name, email address, and profile picture
              from your Google account. We use this information solely for authentication and account creation.
              We do not sell or share Google user data with third parties.
            </p>

            <h3>c) Information from Connected Integrations</h3>
            <p>
              When you connect third-party services, we access data from those platforms to provide
              integration features:
            </p>
            <ul>
              <li><strong>HubSpot:</strong> Deals, contacts, and CRM data you choose to link to roadmap cards.</li>
              <li><strong>Linear:</strong> Issues, projects, and team data for import into your roadmap.</li>
              <li><strong>Notion:</strong> Pages, databases, and content you choose to link or import.</li>
            </ul>
            <p>
              You control which integrations are connected. Disconnecting an integration removes our
              access to that service's data and deletes the associated access tokens from our systems.
            </p>

            <h3>d) Information Collected Automatically</h3>
            <ul>
              <li><strong>Authentication cookies:</strong> We use JWT (JSON Web Token) cookies strictly for session authentication. We do not use tracking or advertising cookies.</li>
              <li><strong>Connection data:</strong> IP address and basic device information transmitted during WebSocket connections for real-time collaboration.</li>
              <li><strong>Server logs:</strong> Standard request logs including IP addresses, timestamps, and request paths, retained for security and debugging purposes.</li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <ul>
              <li>To provide, maintain, and improve the Service</li>
              <li>To authenticate your identity and manage your account</li>
              <li>To enable real-time collaboration with your team</li>
              <li>To power AI features (see Section 4 below)</li>
              <li>To connect with third-party services you authorize</li>
              <li>To communicate with you about your account and service updates</li>
              <li>To detect and prevent security threats, fraud, or abuse</li>
            </ul>
          </section>

          <section>
            <h2>4. AI Features and Data Processing</h2>
            <p>
              Roadway includes AI-powered features that help you manage your roadmap. When you use
              these features, your roadmap data (card names, descriptions, sprint information, and
              related content) may be sent to the following third-party AI providers:
            </p>
            <ul>
              <li><strong>Anthropic (Claude):</strong> For AI chat, suggestions, and feature extraction.</li>
              <li><strong>Google (Gemini):</strong> As an alternative AI provider for the same features.</li>
            </ul>
            <p>
              These AI providers process your data to generate responses and do not use your data to
              train their models under their commercial API terms. AI outputs are suggestions only and
              should be reviewed before acting on them.
            </p>
            <p>
              If you connect Notion with AI context enabled, content from your linked Notion pages may
              also be sent to AI providers to give the assistant more context about your product decisions.
            </p>
          </section>

          <section>
            <h2>5. Third-Party Service Providers</h2>
            <p>We use the following service providers to operate Roadway:</p>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Data Location</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Render</td><td>Application hosting and database</td><td>United States</td></tr>
                <tr><td>Anthropic</td><td>AI processing (Claude)</td><td>United States</td></tr>
                <tr><td>Google</td><td>AI processing (Gemini) and OAuth</td><td>United States</td></tr>
                <tr><td>HubSpot</td><td>User-authorized CRM integration</td><td>United States</td></tr>
                <tr><td>Linear</td><td>User-authorized project management integration</td><td>United States</td></tr>
                <tr><td>Notion</td><td>User-authorized documentation integration</td><td>United States</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>6. Cookies</h2>
            <p>
              Roadway uses only essential cookies required for the Service to function. Specifically,
              we use a JWT authentication cookie to keep you signed in. We do not use analytics,
              advertising, or tracking cookies.
            </p>
          </section>

          <section>
            <h2>7. Data Security</h2>
            <p>We implement the following security measures to protect your data:</p>
            <ul>
              <li>Passwords are hashed using bcrypt (never stored in plain text)</li>
              <li>Integration access tokens are encrypted using AES-256 encryption</li>
              <li>All data transmission uses HTTPS/TLS encryption</li>
              <li>Database queries use parameterized statements to prevent injection attacks</li>
              <li>Data is isolated per workspace — users in one workspace cannot access another's data</li>
            </ul>
            <p>
              While we take reasonable measures to protect your data, no method of electronic
              transmission or storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2>8. Data Retention</h2>
            <p>
              We retain your account data and roadmap content for as long as your account is active.
              If you delete your account, we will delete your personal data within 30 days, except where
              we are required to retain it for legal or security purposes. Server logs are retained
              for up to 90 days.
            </p>
          </section>

          <section>
            <h2>9. Your Rights</h2>

            <h3>All Users</h3>
            <p>You may at any time:</p>
            <ul>
              <li>Access and update your account information in Settings</li>
              <li>Disconnect third-party integrations</li>
              <li>Delete your roadmap data</li>
              <li>Request deletion of your account by contacting us</li>
            </ul>

            <h3>European Economic Area (GDPR)</h3>
            <p>
              If you are in the EEA, you have additional rights under the General Data Protection
              Regulation, including the right to access, rectify, erase, restrict processing, data
              portability, and object to processing of your personal data. Our legal basis for
              processing is contract performance (providing the Service you signed up for) and
              legitimate interest (improving and securing the Service).
            </p>
            <p>
              To exercise these rights, contact us at privacy@roadway-ai.com. We will respond
              within 30 days. You also have the right to lodge a complaint with your local data
              protection authority.
            </p>

            <h3>California Residents (CCPA/CPRA)</h3>
            <p>
              If you are a California resident, you have the right to know what personal information
              we collect, request deletion, and opt out of the sale or sharing of your personal
              information. <strong>We do not sell or share your personal information.</strong>
            </p>
            <p>
              To exercise your rights, contact us at privacy@roadway-ai.com. We will respond
              within 45 days.
            </p>
          </section>

          <section>
            <h2>10. Children's Privacy</h2>
            <p>
              Roadway is not directed at children under the age of 13 (or 16 in the EEA). We do not
              knowingly collect personal information from children. If we learn that we have collected
              data from a child, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2>11. International Data Transfers</h2>
            <p>
              Your data is stored and processed in the United States. If you are accessing the
              Service from outside the United States, your data will be transferred to and processed
              in the United States, where data protection laws may differ from your jurisdiction.
            </p>
          </section>

          <section>
            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant
              changes by posting a notice within the Service or by email. Your continued use of
              Roadway after changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2>13. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise your data rights,
              contact us at:
            </p>
            <p>
              <strong>Email:</strong> privacy@roadway-ai.com<br />
              <strong>Website:</strong> roadway-ai.com
            </p>
          </section>
        </div>

        <div className="legal-footer">
          <Link to="/terms">Terms of Use</Link>
          <span className="legal-footer-sep">|</span>
          <Link to="/login">Sign in to Roadway</Link>
        </div>
      </div>
    </div>
  );
}
