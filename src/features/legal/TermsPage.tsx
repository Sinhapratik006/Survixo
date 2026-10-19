import { Link } from 'react-router-dom';
import { LegalDocument, type LegalSection } from './LegalDocument';

const link = 'text-brand-700 hover:underline dark:text-brand-300';

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <p>
        These terms govern your use of the Nexovra website, dashboard and API (the "Service") operated by [operator legal name]. By creating an account or sending requests you agree to them on behalf
        of yourself and any organization you act for.
      </p>
    ),
  },
  {
    id: 'marketplace',
    title: 'Our role as a marketplace',
    body: (
      <>
        <p>
          The Service connects buyers of AI inference with independent sellers who list inference capacity. We operate the API, routing, metering and billing. We do not train, host or control the
          models offered by sellers, and sellers are not our agents or employees.
        </p>
        <p>
          The routing engine selects an eligible offer for each request according to your request options and routing policy. Routing decisions are based on data available at the time of the request
          and may differ from previews or estimates shown elsewhere in the Service.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and API keys',
    body: (
      <ul>
        <li>You must provide accurate account information and keep credentials secure.</li>
        <li>You are responsible for all activity under your API keys, including charges, until a key is revoked.</li>
        <li>Organization owners and admins are responsible for the roles and permissions they grant to members.</li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You may not use the Service to:</p>
        <ul>
          <li>break the law or infringe the rights of others;</li>
          <li>generate content that sexually exploits minors, incites violence, or facilitates serious harm;</li>
          <li>send data you are not authorized to share with third-party processors;</li>
          <li>probe, overload or circumvent rate limits, budgets, metering or security controls;</li>
          <li>resell access in a way that misrepresents the origin of the service or the identity of the models;</li>
          <li>list endpoints, models or capacity you are not entitled to offer.</li>
        </ul>
        <p>Sellers' own usage policies may impose additional restrictions on requests routed to their offers. We may suspend accounts, keys or offers that violate these terms.</p>
      </>
    ),
  },
  {
    id: 'balance',
    title: 'Prepaid balance and charges',
    body: (
      <>
        <p>
          The Service operates on a prepaid balance. Before a request is dispatched, its worst-case cost is reserved from your available balance; after completion only actual usage at the selected
          offer's per-token prices is charged and the remainder is released. Failed requests are not charged. Interrupted streams are charged for tokens delivered.
        </p>
        <p>
          Prices are set by sellers and may change at any time; the price applied is the one in effect when the request is routed. The platform fee is deducted from seller earnings, not added to buyer
          charges. Refund, payout and commercial terms are set by the operator — see{' '}
          <Link to="/pricing" className={link}>
            Pricing
          </Link>{' '}
          for the current fee configuration.
        </p>
      </>
    ),
  },
  {
    id: 'no-guarantee',
    title: 'Model identity and quality',
    body: (
      <>
        <p>
          Sellers declare which model each offer serves. We validate endpoints and continuously measure latency, success rates and, where available, benchmark results, but we cannot verify the exact
          model, weights, quantization or configuration a seller runs.
        </p>
        <p>
          Beyond the measured data shown in the Service, we make no guarantee about model identity, output quality, accuracy or fitness for a particular purpose. Model outputs may be wrong or
          inappropriate; you are responsible for how you use them. Uptime and reliability figures describe measured history and are not a service level agreement.
        </p>
      </>
    ),
  },
  {
    id: 'demo',
    title: 'Demo mode',
    body: (
      <ul>
        <li>When demo mode is enabled, catalog baseline prices, demo offers and their traffic are illustrative and are labelled as demo data.</li>
        <li>Demo offers route to synthetic endpoints that do not run real models.</li>
        <li>Demo credits have no monetary value, cannot be purchased, transferred or withdrawn, and may be reset at any time.</li>
        <li>Savings and analytics computed from demo data do not represent real market prices or performance.</li>
      </ul>
    ),
  },
  {
    id: 'sellers',
    title: 'Seller obligations',
    body: (
      <>
        <p>If you list offers, you agree to:</p>
        <ul>
          <li>only connect endpoints and serve models you have the right to operate and resell;</li>
          <li>accurately describe the model, capabilities and prices of each offer;</li>
          <li>keep endpoints passing validation and health checks, and honour the capacity and rate limits you configure;</li>
          <li>process buyer data only to fulfil requests and in line with your published data policy and applicable law;</li>
          <li>not log, inspect or reuse buyer prompts or completions beyond what your data policy discloses;</li>
          <li>accept that the platform fee is deducted from earnings and that payout terms are set by the operator.</li>
        </ul>
        <p>Offers that fail health checks may be excluded from routing automatically. Repeated failures or misrepresentation may lead to suspension.</p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Disclaimers and liability',
    body: (
      <p>
        The Service is provided "as is" and "as available". To the maximum extent permitted by law, [operator] disclaims implied warranties and is not liable for indirect or consequential losses, and its
        total liability is limited to the amounts you paid for the Service in the [period] before the claim. [Counsel to complete.]
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Termination and changes',
    body: (
      <p>
        You can stop using the Service and delete your account from{' '}
        <Link to="/dashboard/settings" className={link}>
          Settings
        </Link>{' '}
        at any time. We may suspend or end access for breach of these terms. We may update these terms and will note the effective date above. Governing law and dispute resolution: [to be completed by
        counsel]. Questions:{' '}
        <Link to="/support" className={link}>
          Support
        </Link>
        .
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of service"
      docTitle="Terms"
      intro={
        <p>
          These terms describe the rules for buying and selling inference on the marketplace. Please also read the{' '}
          <Link to="/legal/privacy" className={link}>
            privacy policy
          </Link>
          .
        </p>
      }
      sections={sections}
    />
  );
}
