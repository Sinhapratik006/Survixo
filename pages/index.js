import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import Card from '../components/Card';
import { motion } from 'framer-motion';
import {
  Zap,
  Brain,
  ShieldCheck,
  DollarSign,
  LayoutGrid,
  TrendingUp,
  ArrowRight,
  Play,
} from 'lucide-react';

const features = [
  {
    title: 'Unified API',
    desc: 'One OpenAI-compatible endpoint that routes to any model across any provider.',
    icon: Zap,
    gradient: 'from-brand-500 to-brand-700',
  },
  {
    title: 'Intelligent Routing',
    desc: 'Automatically select the best model based on cost, quality, latency, and your preferences.',
    icon: Brain,
    gradient: 'from-indigo-500 to-purple-600',
  },
  {
    title: 'Budget Guards',
    desc: 'Set spend limits, per-user quotas, and real-time alerts to control inference costs.',
    icon: ShieldCheck,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    title: 'Seller Ecosystem',
    desc: 'List your own models, set your own pricing, and earn from inference traffic.',
    icon: DollarSign,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    title: 'Real-time Analytics',
    desc: 'Live dashboards for token usage, request volume, latency, and cost breakdowns.',
    icon: TrendingUp,
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    title: 'Enterprise Ready',
    desc: 'SOC 2 compliance, SSO, role-based access, and dedicated support for teams.',
    icon: LayoutGrid,
    gradient: 'from-violet-500 to-fuchsia-600',
  },
];

const statItems = [
  { value: '99.9%', label: 'Uptime SLA', sub: 'Global edge network' },
  { value: '<100ms', label: 'P95 latency', sub: 'Smart routing to nearest region' },
  { value: '50+', label: 'Models', sub: 'From 8+ leading providers' },
  { value: '$0.0002', label: 'from /1k tokens', sub: 'Transparent, usage-based pricing' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 -z-10 bg-[url('https://images.unsplash.com/photo-1677442136019-21780ecad995?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')] bg-cover bg-center opacity-[0.08] dark:opacity-[0.15]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-canvas dark:to-navy-950" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-500/20 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/20 blur-[120px]" />
        </div>
        <div className="container-page">
          <div className="grid xl:grid-cols-2 gap-10 xl:gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50/60 dark:bg-brand-900/20 border border-brand-100/30 dark:border-brand-800/30 backdrop-blur-sm text-brand-700 dark:text-brand-300 text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                </span>
                Public beta now open
              </div>
              <h1 className="text-[2.5rem] sm:text-[4rem] md:text-[5rem] xl:text-[5.5rem] font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.08] sm:leading-none">
                AI inference,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-600">
                  intelligently routed.
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg">
                Nexovra gives you one OpenAI-compatible API for every model. Smart routing,
                budget guards, and a marketplace where anyone can sell inference.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <Button size="lg" className="w-full sm:w-auto shadow-xl shadow-brand-500/25">
                  <ArrowRight className="w-4 h-4" /> Get your API key
                </Button>
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  <Play className="w-4 h-4" /> View docs
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500 dark:text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>SOC 2 Type II compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>GDPR & CCPA ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>No credit card required</span>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative max-w-2xl mx-auto xl:max-w-none"
            >
              <div className="relative z-10 glass p-5 sm:p-8 rounded-3xl shadow-2xl border border-white/30 dark:border-navy-700/30">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-lg font-bold">
                      D
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Dashboard</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-500">Live metrics</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">12.4k</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Requests today</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { value: '$0.00', label: 'Spend today', color: 'brand' },
                    { value: '12.4k', label: 'Requests', color: 'blue' },
                    { value: '99.9%', label: 'Uptime', color: 'purple' },
                  ].map((stat, i) => (
                    <div
                      key={stat.label}
                      className={`p-3 sm:p-4 rounded-xl border ${
                        stat.color === 'brand'
                          ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-100/30 dark:border-brand-800/30'
                          : stat.color === 'blue'
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100/30 dark:border-blue-800/30'
                          : 'bg-purple-50 dark:bg-purple-900/20 border-purple-100/30 dark:border-purple-800/30'
                      }`}
                    >
                      <div className="text-xl sm:text-2xl font-bold">
                        {(stat.color === 'brand'
                          ? 'text-brand-600 dark:text-brand-400'
                          : stat.color === 'blue'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-purple-600 dark:text-purple-400')}
                        {stat.value}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  {['gpt-5', 'claude-opus-4', 'gemini-2.5', 'llama-4'].map((model, i) => (
                    <motion.div
                      key={model}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold">
                        {model.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{model}</span>
                      <span className="ml-auto text-xs font-medium text-brand-600 dark:text-brand-400">
                        $0.0002/1k
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-purple-600 rounded-3xl blur opacity-30 animate-pulse" />
              <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-gradient-to-br from-brand-500/20 to-purple-500/20 rounded-full blur-3xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-slate-200/50 dark:border-navy-800/30 bg-white/30 dark:bg-navy-950/30 backdrop-blur-sm">
        <div className="container-page py-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-navy-400 text-center mb-8">
            Trusted by innovative AI teams
          </p>
          <div className="flex flex-wrap justify-center gap-10 md:gap-20 opacity-50 grayscale sm:grayscale-0">
            {['Cursor', 'Perplexity', 'Replicate', 'Hugging Face', 'Together AI'].map(
              (name) => (
                <span key={name} className="text-lg font-semibold text-slate-500 dark:text-slate-400">
                  {name}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 relative">
        <div className="container-page">
          <div className="text-center mb-16">
            <h2 className="text-h2 text-slate-900 dark:text-white mb-4">Built for teams shipping AI</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              From smart routing to spend controls, Nexovra handles the complexity so you
              can focus on building.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card key={feature.title} hover className="group relative overflow-hidden" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 dark:from-brand-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 space-y-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-2 shadow-lg shadow-lg/25" style={{ background: `linear-gradient(135deg, ${feature.gradient})` }}>
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 bg-slate-50 dark:bg-navy-900/30 border-y border-slate-200/50 dark:border-navy-800/30">
        <div className="container-page">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {statItems.map((stat, i) => (
              <div key={stat.label} className="text-center" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <span className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">{stat.value}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{stat.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-brand-600/10 to-purple-600/10" />
        <div className="container-page">
          <div className="glass rounded-3xl p-8 md:p-12 text-center border border-white/30 dark:border-navy-700/30 shadow-2xl">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Ready to scale your inference?
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-xl mx-auto">
              Join the public beta and get your API key in seconds. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="w-full sm:w-auto shadow-xl shadow-brand-500/25">
                <ArrowRight className="w-4 h-4" /> Get started free
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Talk to sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
