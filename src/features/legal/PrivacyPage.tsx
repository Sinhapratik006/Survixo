import { Link } from 'react-router-dom';
import { LegalDocument, type LegalSection } from './LegalDocument';

const sections: LegalSection[] = [
  {
    id: 'scope',
    title: 'Scope and roles',
    body: (
      <>
        <p>
          This policy covers the Nexovra website, dashboard and API (together, the "Service"), operated by [operator legal name] ("we"). It applies to buyers who send inference requests, sellers who
          list inference capacity, and visitors to public pages.
        </p>
        <p>
          For prompts and completions routed through the marketplace, we act as an intermediary between you and the seller whose offer serves the request. Sellers are independent third parties.
        </p>
      </>
    ),
  },
  {
    id: 'account-data',
    title: 'Account information',
    body: (
      <>
        <p>When you create an account we collect your email address, an optional display name and, if you set one, a password stored only as a salted one-way hash.</p>
        <p>
          If you sign in with Google, we receive your name, email address and profile picture (avatar) from Google, along with Google's account identifier used to link the sign-in. We do not receive your
          Google password or access to other Google data.
        </p>
        <p>We also store organization membership and roles, theme preference, and active session records (including browser user agent and IP address) so you can review and revoke sessions.</p>
      </>
    ),
  },
  {
    id: 'inference-data',
    title: 'Prompts, completions and request metadata',
    body: (
      <>
        <p>
          <strong>Prompts and completions are not stored by default.</strong> They pass through the Service to the selected seller and the response is returned to you.
        </p>
        <p>
          An organization owner or admin may opt in to <em>redacted prompt retention</em> for 7 or 30 days, for debugging and request replay. Retained prompts are processed with best-effort secret
          redaction and are deleted automatically when the retention period ends. Switching retention off deletes stored prompts immediately.
        </p>
        <p>
          For every request we record operational metadata: timestamps, requested and served model, selected offer and seller, routing decision and rejection reasons, token counts, cost, latency,
          status and error codes, and the API key used. Metadata retention is configurable per organization between 7 and 365 days, with a default of 90 days. Aggregated, non-identifying statistics
          (such as offer latency and success rates) may be kept longer to power public marketplace analytics.
        </p>
      </>
    ),
  },
  {
    id: 'sellers',
    title: 'Third-party sellers',
    body: (
      <>
        <p>
          To fulfil a request, the prompt and parameters are forwarded to the seller operating the selected offer. Sellers process that data under their own terms and data policies, which may differ
          from ours — including how long they keep inputs and outputs. Where available, provider data policy links are shown in the catalog.
        </p>
        <p>
          You can limit which providers receive your traffic with routing policies (allowlists and blocklists). Do not send data you are not permitted to share with third-party processors.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect credentials',
    body: (
      <ul>
        <li>API keys are shown once at creation and stored only as keyed hashes; we cannot recover a lost key.</li>
        <li>Seller endpoint credentials and webhook secrets are envelope-encrypted at rest: each secret has its own data key, which is itself encrypted with a master key.</li>
        <li>Upstream credentials are never sent to the browser.</li>
        <li>Account changes, key management and billing actions are written to an audit log visible to organization admins.</li>
      </ul>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <>
        <p>We use only strictly necessary cookies:</p>
        <ul>
          <li>
            a session cookie (<code>nx_session</code>, HTTP-only) that keeps you signed in;
          </li>
          <li>
            a CSRF cookie (<code>nx_csrf</code>) that protects dashboard actions from cross-site request forgery;
          </li>
          <li>
            a short-lived sign-in state cookie (<code>nx_oauth</code>) used only during Google sign-in.
          </li>
        </ul>
        <p>We do not use advertising or cross-site tracking cookies. Your theme and active-organization preferences are kept in your browser's local storage.</p>
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Billing data',
    body: (
      <p>
        When card payments are enabled, payments are processed by Stripe. We receive payment status and amounts, but not full card numbers. In demo billing mode no payment information is collected and
        balances are non-monetary demo credits.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    body: (
      <>
        <p>
          You can update your profile, revoke sessions, unlink Google sign-in and delete your account from{' '}
          <Link to="/dashboard/settings" className="text-brand-700 hover:underline dark:text-brand-300">
            Settings
          </Link>
          . Deleting your account removes your user record and personal workspace; shared organizations you belong to keep their own records. Organization admins control prompt and metadata retention.
        </p>
        <p>Depending on where you live, you may have additional rights to access, correct, export or object to processing of your data. Contact us using the details on the support page.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    body: (
      <p>
        We will update this page when our practices change and note the effective date above. Questions can be sent through{' '}
        <Link to="/support" className="text-brand-700 hover:underline dark:text-brand-300">
          Support
        </Link>
        . [Operator to add data controller details and, where required, a representative or data protection officer.]
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy policy"
      docTitle="Privacy"
      intro={<p>This policy explains what data the Service collects, why, how long it is kept, and who it is shared with. It reflects how the software is built today.</p>}
      sections={sections}
    />
  );
}
