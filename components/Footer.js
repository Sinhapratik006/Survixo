import Link from 'next/link';
import Logo from './Logo';

const columns = [
  {
    title: 'Product',
    links: [
      { name: 'Marketplace', href: '/marketplace' },
      { name: 'Models', href: '/models' },
      { name: 'Calculator', href: '/calculator' },
      { name: 'Analytics', href: '/analytics' },
    ],
  },
  {
    title: 'Build',
    links: [
      { name: 'API docs', href: '/docs' },
      { name: 'API keys', href: '/app/keys' },
      { name: 'Usage', href: '/app/usage' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { name: 'Seller dashboard', href: '/seller/dashboard' },
      { name: 'Create listing', href: '/seller/create' },
      { name: 'Payouts', href: '/seller/payouts' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'Contact', href: '/messages' },
      { name: 'Status', href: '#' },
      { name: 'Blog', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { name: 'Terms', href: '/legal' },
      { name: 'Privacy', href: '/legal' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-[90px] border-t border-line">
      <div className="container-page">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-6 pt-[50px] pb-10">
          <div className="col-span-2 md:col-span-1">
            <Logo className="text-[15px]" size={24} />
            <p className="mt-4 font-mono text-[12.5px] leading-relaxed text-ink-muted max-w-[220px]">
              One OpenAI-compatible API. Every model. Routed for cost.
            </p>
            <p className="mt-4 font-mono text-[12px] text-ink-2">hello@apitradex.local</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <b className="block mb-3 font-mono text-xs font-normal uppercase tracking-[0.08em] text-ink">
                {col.title}
              </b>
              {col.links.map((l) => (
                <Link
                  key={l.name}
                  href={l.href}
                  className="block py-[3px] text-[13.5px] text-ink-muted hover:text-ink transition-colors"
                >
                  {l.name}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between gap-3 pb-[26px] font-mono text-xs text-ink-faint">
          <span>&copy; {new Date().getFullYear()} ApiTradeX. All rights reserved.</span>
          <span>SOC 2 Type II · GDPR</span>
        </div>

        <div className="giant pb-[30px] select-none" aria-hidden="true">
          APITRADEX
        </div>
      </div>
    </footer>
  );
}
