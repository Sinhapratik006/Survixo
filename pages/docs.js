import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Card from '../components/Card';
import Button from '../components/Button';
import {
  BookOpen,
  Zap,
  ShieldCheck,
  DollarSign,
  LayoutGrid,
  FileCode,
  Server,
  Users,
  ArrowRight,
} from 'lucide-react';

const sections = [
  {
    title: 'Quickstart',
    desc: 'Get your first API key and make your first inference request in under 2 minutes.',
    icon: Zap,
    href: '/docs/quickstart',
  },
  {
    title: 'Authentication',
    desc: 'Sign in with Google OAuth or email/password. All requests use API keys or session cookies.',
    icon: ShieldCheck,
    href: '/docs/auth',
  },
  {
    title: 'Routing Policies',
    desc: 'Configure smart routing by cost, quality, latency, or custom rules per model.',
    icon: Server,
    href: '/docs/routing',
  },
  {
    title: 'Budget Guards',
    desc: 'Set spend limits, per-user quotas, and real-time alerts to control inference costs.',
    icon: DollarSign,
    href: '/docs/budget',
  },
  {
    title: 'Error Codes',
    desc: 'Reference for HTTP status codes, inference errors, and retry handling.',
    icon: FileCode,
    href: '/docs/errors',
  },
  {
    title: 'Seller Guide',
    desc: 'List your own models, set your own pricing, and earn from inference traffic.',
    icon: Users,
    href: '/docs/sellers',
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <section className="py-16">
        <div className="container-page">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-12">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 border border-brand-100/30 dark:border-brand-800/30 text-brand-700 dark:text-brand-300 text-xs font-medium mb-6">
                <BookOpen className="w-3 h-3" /> Documentation v1
              </div>
              <h1 className="text-h1 text-slate-900 dark:text-white mb-4">Documentation</h1>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                Find guides, API references, and integration help for the Nexovra inference API.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Button variant="outline" className="text-sm">
                Open API reference
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {sections.map((s, i) => (
              <Card
                key={s.title}
                hover
                className="group p-6"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center text-slate-600 dark:text-slate-300 mb-5 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                  <s.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{s.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                  {s.desc}
                </p>
                <Link
                  href={s.href}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 hover:gap-2 transition-all"
                >
                  Read guide <ArrowRight className="w-3 h-3" />
                </Link>
              </Card>
            ))}
          </div>

          <div className="mt-16 pt-12 border-t border-slate-100 dark:border-navy-800/30">
            <div className="glass rounded-3xl p-8 md:p-12 border border-white/30 dark:border-navy-700/30">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                    Need help integrating?
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Join our Discord or email support for priority assistance.
                  </p>
                </div>
                <Button size="lg" className="shadow-xl shadow-brand-500/25">
                  Contact sales <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
