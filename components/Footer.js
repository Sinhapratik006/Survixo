import Link from 'next/link';
import { Mail, ArrowRight } from 'lucide-react';

const productLinks = [
  { name: 'Models', href: '/models' },
  { name: 'Calculator', href: '/calculator' },
  { name: 'Pricing', href: '#' },
  { name: 'Docs', href: '/docs' },
];

const companyLinks = [
  { name: 'About', href: '#' },
  { name: 'Blog', href: '#' },
  { name: 'Contact', href: '#' },
  { name: 'Status', href: '#' },
];

const legalLinks = [
  { name: 'Terms', href: '/legal' },
  { name: 'Privacy', href: '#' },
  { name: 'Cookie Policy', href: '#' },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/50 dark:border-navy-800/30 bg-white dark:bg-navy-950">
      <div className="container-page py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30 relative overflow-hidden">
                <span className="text-white font-bold text-xs">N</span>
                <div className="absolute inset-0 bg-white/10" />
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">Nexovra</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
              The unified OpenAI-compatible API for AI inference with intelligent routing,
              budget guards, and a full seller ecosystem.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <a
                href="mailto:hello@nexovra.local"
                className="w-8 h-8 rounded-xl border border-slate-200 dark:border-navy-800 bg-white dark:bg-navy-900 text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-brand-600 hover:text-white hover:border-brand-600 transition-all duration-200"
                aria-label="Email"
              >
                <Mail className="w-4 h-4" />
              </a>
              <a href="#" className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                Twitter
              </a>
              <a href="#" className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                GitHub
              </a>
              <a href="#" className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                Discord
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-navy-300 mb-6">
              Product
            </h4>
            <ul className="space-y-3">
              {productLinks.map((l) => (
                <li key={l.name}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-navy-300 mb-6">
              Company
            </h4>
            <ul className="space-y-3">
              {companyLinks.map((l) => (
                <li key={l.name}>
                  <a
                    href={l.href}
                    className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {l.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-navy-300 mb-6">
              Legal
            </h4>
            <ul className="space-y-3">
              {legalLinks.map((l) => (
                <li key={l.name}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100 dark:border-navy-800/30 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} Nexovra. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-xs text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> SOC 2 Type II
            </span>
            <span className="flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> GDPR compliant
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
