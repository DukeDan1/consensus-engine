export default function TermsPage() {
  return (
    <main className="container py-5" style={{ maxWidth: 900 }}>
      <h1 className="mb-4">Privacy Policy &amp; Terms of Service for Consensus Engine</h1>
      <p>
        This document sets out the Terms of Service and Privacy Policy for the Consensus Engine (the “Platform”),
        an online consensus management and debate platform described <a href="https://github.com/DukeDan1/consensus-engine/blob/main/README.md" target="_blank" rel="noopener noreferrer">in the repository README.</a> The Platform helps
        users conduct structured debates, annotate evidence and reach agreement using AI-assisted mediation. It is
        operated by Consensus Engine (“we,” “us,” or “our”). By registering an account or accessing the Platform,
        you (“User”, “you”) agree to these Terms and consent to the data practices described below.
      </p>

      <h2 className="h4 mt-4">1. Key Definitions</h2>
      <p>
        <strong>Platform</strong> – The Consensus Engine website and associated services, including structured discussions,
        AI‑assisted moderation, and evidence tagging.
      </p>
      <p>
        <strong>User Content</strong> – All text, comments, posts, debates, votes, evidence tags and other content submitted by Users.
      </p>
      <p>
        <strong>Personal Data</strong> – Any information relating to an identified or identifiable natural person, such as your name,
        email address, IP address, profile information and any content that may identify you.
      </p>
      <p>
        <strong>GDPR</strong> – The EU General Data Protection Regulation and its UK counterpart (UK GDPR).
      </p>

      <h2 className="h4 mt-4">2. Eligibility and Account Registration</h2>
      <p>
        You must be at least 18 years old and capable of forming a binding contract to use the Platform. By registering
        an account, you represent that you meet these requirements.
      </p>
      <p>
        You must provide accurate and complete information when registering. Users may create accounts with an email and provide their name and other profile information.
      </p>
      <p>
        You are responsible for maintaining the confidentiality of your login credentials and for all activities under your
        account. You agree to notify us immediately of any unauthorised use.
      </p>

      <h2 className="h4 mt-4">3. User Conduct and Content</h2>
      <p>
        <b>Respectful participation.</b> You agree to use the Platform for good‑faith debate. Do not post illegal, infringing, hateful,
        defamatory or harassing content.
      </p>
      <p>
        <b>Evidence and sources.</b> When tagging evidence, provide accurate source links and refrain from misrepresenting information.
        Automated systems may flag posts and comments for moderation.
      </p>
      <p>
        <b>No misuse of AI.</b> The Platform uses AI services for summarisation, conflict detection and moderation. You may not attempt
        to bypass or undermine these systems.
      </p>
      <p>
        <b>No reverse engineering.</b> Do not access or use the Platform to create a competing service, scrape data without our
        permission, or attempt to reverse engineer our software, AI models or APIs.
      </p>
      <p>
        <b>Moderation.</b> We reserve the right to remove or edit User Content that violates these Terms or our policies. Administrators
        and moderators have defined powers to delete posts, suspend users or approve flagged content.
      </p>

      <h2 className="h4 mt-4">4. Intellectual Property</h2>
      <p>
        <b>Your content.</b> You retain ownership of User Content you create. By submitting User Content, you grant us a worldwide,
        royalty‑free, non‑exclusive licence to host, store, reproduce, modify (solely for formatting and display), publish and
        display your content to operate and improve the Platform.
      </p>
      <p>
        <b>Our content.</b> The Platform, including all software, code, design, graphics and compiled data, is owned by us or our
        licensors. You may not copy, modify, distribute or create derivative works without our prior written consent.
      </p>
      <p>
        <b>Feedback.</b> If you provide feedback or suggestions, you grant us a perpetual, irrevocable licence to use and incorporate
        such feedback without any obligation to you.
      </p>

      <h2 className="h4 mt-4">5. Privacy Policy</h2>
      <h3 className="h5 mt-3">5.1 Data We Collect</h3>
      <p>We collect and process the following categories of Personal Data:</p>
      <div className="table-responsive">
        <table className="table table-bordered align-middle">
          <thead>
            <tr>
              <th>Data Category</th>
              <th>Examples / Source</th>
              <th>Purpose &amp; Legal Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account information</td>
              <td>Email, name, password hash and preferences</td>
              <td>Used to create and manage your account, authenticate you (performance of contract) and personalise the Platform (legitimate interest).</td>
            </tr>
            <tr>
              <td>Profile and User Content</td>
              <td>Posts, comments, debates, votes, evidence tags, trust events and profile information, including your profile picture and bio.</td>
              <td>Stored to provide the service (performance of contract), moderate content (legitimate interest) and provide analytics.</td>
            </tr>
            <tr>
              <td>Contact &amp; communications data</td>
              <td>Email address used for notifications, password resets, welcome message, logs of messages sent via the Platform</td>
              <td>Used to provide transactional emails and communications (performance of contract) and, with consent, send optional notification emails.</td>
            </tr>
            <tr>
              <td>Technical data</td>
              <td>IP addresses (signup and login), device/browser type, login history and user agent</td>
              <td>Used to secure accounts, prevent fraud, enforce moderation and detect abuse (legitimate interest).</td>
            </tr>
            <tr>
              <td>Optional uploads</td>
              <td>If you upload files (avatars, evidence images), we may process images stored on Google Cloud Storage or similar services</td>
              <td>Used to provide file‑upload functionality (performance of contract); images may undergo safety checks to blur sensitive content.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>We do not knowingly collect data about children. If you believe a child under 18 has provided Personal Data, please contact us.</p>

      <h3 className="h5 mt-3">5.2 How We Use Your Data</h3>
      <p>We process Personal Data to:</p>
      <ul>
        <li><b>Provide and operate the Platform.</b> This includes creating accounts, authenticating users, hosting discussions, storing User Content and providing AI‑assisted moderation and summarisation.</li>
        <li><b>Communicate with you.</b> We send transactional emails (registration confirmations, password resets) and, if you opt in, notification emails.</li>
        <li><b>Moderate content and enforce rules.</b> We use a combination of automated systems and human moderators to detect and remove content that violates our policies. Trust scores, downvote ratios and other metrics may influence moderation decisions.</li>
        <li><b>Improve the Platform.</b> We analyse aggregated usage patterns to improve our services, develop new features and conduct research. Where possible, analytics data is pseudonymised or aggregated.</li>
        <li><b>Comply with legal obligations.</b> This includes keeping records of user consent, responding to lawful requests and enforcing our Terms.</li>
      </ul>

      <h3 className="h5 mt-3">5.3 Cookies and Similar Technologies</h3>
      <p>
        The Platform uses cookies and local storage to maintain your session after login, store preferences (e.g., theme and
        language), and analyse usage patterns via first‑party analytics. You can manage cookies through your browser settings.
        Disabling cookies may affect your ability to use certain features.
      </p>

      <h3 className="h5 mt-3">5.4 Sharing Your Data</h3>
      <p>
        We do not sell or rent your Personal Data. We share data only as necessary to provide the service, comply with the law
        or protect our rights:
      </p>
      <ul>
        <li><b>Service providers.</b> We use third‑party services to host data (e.g., MongoDB Atlas), send emails (Azure Communication Services),
        store files (Google Cloud Storage) and provide AI services (e.g. OpenAI API). These providers act on our behalf and are subject to
        appropriate contractual protections.</li>
        <li><b>Moderators and administrators.</b> Trusted users and staff with moderation permissions may access certain content and user
        information to enforce policies.</li>
        <li><b>Legal compliance.</b> We may disclose Personal Data if required by law or to respond to lawful requests (e.g., court orders).</li>
      </ul>

      <h3 className="h5 mt-3">5.5 International Data Transfers</h3>
      <p>
        Our servers may be located in the UK, EU or other jurisdictions. If we transfer Personal Data to a country outside the UK/EU
        that does not provide an adequate level of protection, we will implement safeguards such as Standard Contractual Clauses or
        rely on permissible derogations under GDPR.
      </p>

      <h3 className="h5 mt-3">5.6 Data Retention</h3>
      <p>
        We retain Personal Data as long as your account remains active and for a reasonable period thereafter to comply with legal
        obligations and resolve disputes. Login history, trust events and moderation logs may be kept to maintain the integrity of
        the Platform. We regularly review our retention practices and anonymise or delete data that is no longer needed.
      </p>

      <h3 className="h5 mt-3">5.7 Your Rights Under GDPR/UK GDPR</h3>
      <p>Subject to conditions and legal exceptions, you have the following rights:</p>
      <ul>
        <li><b>Right of access</b> – Obtain confirmation as to whether Personal Data about you is processed and access to that data.</li>
        <li><b>Right to rectification</b> – Request correction of inaccurate or incomplete data.</li>
        <li><b>Right to erasure</b> – Request deletion of your Personal Data where there is no lawful reason for us to continue processing it.</li>
        <li><b>Right to restriction</b> – Request that we limit the processing of your data under certain conditions.</li>
        <li><b>Right to data portability</b> – Receive your Personal Data in a structured, commonly used format and, where technically feasible, have it transmitted to another controller.</li>
        <li><b>Right to object</b> – Object to processing based on legitimate interests and to direct marketing at any time.</li>
        <li><b>Rights relating to automated decision‑making</b> – We do not make decisions that produce legal effects solely by automated means; however, moderation may involve automated flagging and trust scores. You can contest moderation decisions by contacting support.</li>
      </ul>
      <p>
        To exercise your rights, contact us at the address below. We will respond within one month. You also have the right to lodge
        a complaint with the Information Commissioner’s Office (ICO) in the UK or your local supervisory authority.
      </p>

      <h3 className="h5 mt-3">5.8 Security Measures</h3>
      <p>We implement technical and organisational measures to protect your data, such as:</p>
      <ul>
        <li>Secure password hashing;</li>
        <li>Access controls and encryption in transit for network communications;</li>
        <li>Least‑privilege access policies for staff and moderators;</li>
        <li>Storing uploads in secure cloud storage with controlled permissions.</li>
      </ul>
      <p>
        No system is completely secure, and we cannot guarantee absolute security. You are responsible for keeping your password confidential.
      </p>

      <h3 className="h5 mt-3">5.9 Children’s Privacy</h3>
      <p>
        The Platform is not directed to children under 18, and we do not knowingly collect Personal Data from children. If we learn that
        a user is under 18, we will close the account and delete Personal Data.
      </p>

      <h3 className="h5 mt-3">5.10 Changes to this Policy</h3>
      <p>
        We may update this Privacy Policy &amp; Terms of Service from time to time. If we make material changes, we will provide notice
        (e.g., by posting an announcement on the Platform or emailing registered users). The “Last updated” date at the top of this
        document will indicate when the latest revision was made. Your continued use of the Platform after changes become effective
        constitutes acceptance of the revised terms.
      </p>

      <h2 className="h4 mt-4">6. AI and Automated Processing</h2>
      <p>
        The Platform leverages the OpenAI API and other AI providers to summarise debates, detect conflicts and suggest compromises.
        These systems may analyse User Content to provide neutral moderation. While AI may flag content for review or help assign trust
        scores, final decisions are reviewed by human moderators. You acknowledge that AI predictions may sometimes be inaccurate; we
        encourage users to report erroneous moderation or summarisation.
      </p>

      <h2 className="h4 mt-4">7. Disclaimer and Limitation of Liability</h2>
      <p>
        The Platform is provided on an “as‑is” basis. We do not guarantee that the Platform will always be available, secure or error‑free.
      </p>
      <p>
        To the extent permitted by law, we exclude all implied warranties. We are not liable for any indirect or consequential damages
        arising from your use of the Platform, including lost profits or data.
      </p>
      <p>
        Our total liability under these Terms shall not exceed the amount you paid (if any) to use the Platform during the twelve months
        prior to the event giving rise to liability.
      </p>
      <p>
        Nothing in these Terms limits liability for fraud, fraudulent misrepresentation or any other liability that cannot be excluded
        under applicable law.
      </p>

      <h2 className="h4 mt-4">8. Indemnity</h2>
      <p>
        You agree to indemnify and hold us harmless from any losses, damages, liabilities and expenses (including legal fees) arising from
        your use of the Platform, your violation of these Terms or any infringement of another person’s rights.
      </p>

      <h2 className="h4 mt-4">9. Termination</h2>
      <p>
        We may suspend or terminate your access to the Platform at our discretion, including if you violate these Terms or applicable laws.
        Upon termination, the licences granted to you will cease, but sections relating to intellectual property, limitations of liability,
        indemnity and privacy will continue to apply. You may delete your account at any time; however, we may retain certain content and logs
        as permitted by law (see Data Retention).
      </p>

      <h2 className="h4 mt-4">10. Governing Law</h2>
      <p>
        These Terms of Service and Privacy Policy are governed by and construed in accordance with the laws of Scotland, without
        regard to conflict of law principles. If you reside in the UK or EU, you may additionally rely on mandatory consumer protection laws
        of your home jurisdiction. Any disputes shall be subject to the exclusive jurisdiction of the courts of Scotland.
      </p>

      <h2 className="h4 mt-4">11. Contact Information</h2>
      <p>
        If you have questions about these Terms or Privacy Policy, wish to exercise your data rights or need to contest a moderation
        decision, please contact us at:
      </p>
      <p>Email: <a href="mailto:daniel.shields@hotmail.co.uk">daniel.shields@hotmail.co.uk</a></p>
      <p className="text-muted mt-4">Last updated: 4 February 2026</p>
    </main>
  );
}
