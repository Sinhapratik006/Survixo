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
  Code,
  Terminal,
  Globe,
  Users,
} from 'lucide-react';

const features = [
  {
    title: 'Unified API',
    desc: 'One OpenAI-compatible endpoint that routes to any model across any provider.',
    icon: Zap,
    gradient: 'from-brand-500 via-indigo-500 to-purple-600',
    badge: 'REST',
  },
  {
    title: 'Intelligent Routing',
    desc: 'Automatically select the best model based on cost, quality, latency, and your preferences.',
    icon: Brain,
    gradient: 'from-violet-500 via-fuchsia-500 to-pink-500',
    badge: 'Smart',
  },
  {
    title: 'Budget Guards',
    desc: 'Set spend limits, per-user quotas, and real-time alerts to control inference costs.',
    icon: ShieldCheck,
    gradient: 'from-emerald-400 via-teal-500 to-cyan-500',
    badge: 'Controls',
  },
  {
    title: 'Seller Ecosystem',
    desc: 'List your own models, set your own pricing, and earn from inference traffic.',
    icon: DollarSign,
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    badge: 'Marketplace',
  },
  {
    title: 'Real-time Analytics',
    desc: 'Live dashboards for token usage, request volume, latency, and cost breakdowns.',
    icon: TrendingUp,
    gradient: 'from-blue-400 via-cyan-500 to-blue-600',
    badge: 'Live',
  },
  {
    title: 'Enterprise Ready',
    desc: 'SOC 2 compliance, SSO, role-based access, and dedicated support for teams.',
    icon: LayoutGrid,
    gradient: 'from-indigo-500 via-violet-500 to-brand-600',
    badge: 'SSO',
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
    <div className="min-h-screen bg-canvas dark:bg-navy-950 text-slate-900 dark:text-slate-100 selection:bg-brand-500/30 selection:text-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-20 md:py-36 lg:py-44">
        {/* Animated mesh gradient background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-500/20 blur-[140px] filter brightness-110 animate-pulse" />
          <div className="absolute top-[-5%] right-[-15%] w-[45%] h-[45%] rounded-full bg-purple-600/20 blur-[140px] filter brightness-110 animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/15 blur-[120px] filter brightness-100 animate-pulse" style={{ animationDelay: '4s' }} />
          <div className="absolute bottom-[-5%] right-[-10%] w-[35%] h-[35%] rounded-full bg-pink-500/10 blur-[100px] filter brightness-90 animate-pulse" style={{ animationDelay: '6s' }} />
          {/* Subtle grid */}
          <div className="absolute inset-0 [mask-image:radial-gradient(circle,white_60%,transparent_100%)] opacity-20 dark:opacity-10 pointer-events-none" />
        </div>

        <div className="relative z-10 container-page">
          <div className="grid xl:grid-cols-2 gap-12 xl:gap-16 items-start">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="space-y-7"
            >
              <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/50 dark:bg-white/5 border border-white/60 dark:border-white/10 backdrop-blur-md text-brand-600 dark:text-brand-400 text-xs font-semibold tracking-wide uppercase shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-70 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500 shadow-[0_0_8px_rgba(41,112,255,0.6)]" />
                </span>
                Public beta — now open
              </div>
              <h1 className="text-[3rem] sm:text-[4.25rem] md:text-[5rem] xl:text-[6rem] font-extrabold tracking-tight leading-[1.05]">
                AI inference,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-600">
                  intelligently routed.
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg font-light">
                One OpenAI-compatible API for every model. Smart routing, budget guards, and a
                marketplace where anyone can sell inference.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Button size="lg" className="w-full sm:w-auto shadow-xl shadow-brand-500/30 flex items-center gap-2 group">
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> Get your API key
                </Button>
                <Button variant="outline" size="lg" className="w-full sm:w-auto flex items-center gap-2 group">
                  <Play className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> View docs
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 text-[11px] text-slate-500 dark:text-slate-500/70 uppercase tracking-widest font-medium">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                  <span>SOC 2 Type II compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                  <span>GDPR &amp; CCPA ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                  <span>No credit card required</span>
                </div>
              </div>
            </motion.div>

            {/* Right: Preview panel */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }}
              className="relative max-w-none"
            >
              <div className="relative z-10 glass p-6 md:p-8 rounded-3xl shadow-2xl border border-white/40 dark:border-white/10">
                {/* Panel header */}
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-brand-500/30 relative overflow-hidden">
                      N
                      <div className="absolute inset-0 bg-white/10" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">Nexovra Console</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Live metrics</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">12.4k</p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Requests today</p>
                  </div>
                </div>

                {/* Quick stat chips */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[
                    { value: '$0.00', label: 'Spend today', color: 'from-brand-500 to-purple-600', text: 'text-slate-700 dark:text-slate-200' },
                    { value: '12.4k', label: 'Requests', color: 'from-indigo-400 to-cyan-500', text: 'text-slate-700 dark:text-slate-200' },
                    { value: '99.9%', label: 'Uptime', color: 'from-emerald-400 to-teal-500', text: 'text-slate-700 dark:text-slate-200' },
                  ].map((stat) => (
                    <div key={stat.label} className="p-3 rounded-2xl border border-white/30 dark:border-white/10 bg-gradient-to-br from-white/40 dark:from-white/5 to-white/10 dark:to-transparent backdrop-blur-sm shadow-sm">
                      <div className="text-lg sm:text-xl font-bold" style={{ background: `linear-gradient(135deg, ${stat.color})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {stat.value}
                      </div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Model list */}
                <div className="space-y-2">
                  {['gpt-5', 'claude-opus-4', 'gemini-2.5', 'llama-4', 'deepseek-v3'].map((model, i) => (
                    <motion.div
                      key={model}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.08 }}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-white/30 dark:border-white/10 bg-gradient-to-br from-white/20 dark:from-white/5 to-transparent backdrop-blur-sm transition-all hover:bg-white/30 dark:hover:bg-white/10"
                    >
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shadow-md shadow-brand-500/25">
                        {model.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{model}</span>
                      <span className="ml-auto text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-white/20 dark:bg-white/5 px-2 py-0.5 rounded-full border border-white/20 dark:border-white/10">
                        $0.0002/1k
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
              {/* Glow behind panel */}
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/40 via-purple-600/40 to-pink-500/40 rounded-3xl blur-2xl opacity-50 animate-pulse" />
              <div className="absolute -bottom-12 -right-12 w-72 h-72 bg-gradient-to-br from-brand-500/20 via-purple-600/20 to-pink-500/20 rounded-full blur-[100px]" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Code preview block ── */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-canvas dark:to-navy-950/40" />
        <div className="relative z-10 container-page">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-white dark:bg-navy-900/40 shadow-2xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/30 dark:border-white/10 bg-slate-50 dark:bg-navy-800/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                  <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                </div>
                <span className="ml-3 text-[10px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase">bash session</span>
                <span className="ml-auto text-[10px] font-medium text-slate-500 dark:text-slate-400">nexovra.sh</span>
              </div>
              <div className="p-5 md:p-7 font-mono text-sm md:text-base leading-relaxed overflow-x-auto">
                <span className="text-slate-500 dark:text-slate-400">$</span>{' '}
                <span className="text-brand-600 dark:text-brand-400 font-semibold">curl https://api.nexovra.local/v1/chat/completions</span><br />
                <span className="text-slate-400 dark:text-slate-500">  -H "Authorization: Bearer nxv_..."</span><br />
                <span className="text-slate-400 dark:text-slate-500">  -H "Content-Type: application/json"</span><br />
                <span className="text-slate-400 dark:text-slate-500">  -d &#123;</span><br />
                <span className="text-indigo-400 dark:text-indigo-400 pl-4">    "model": "gpt-5",</span><br />
                <span className="text-indigo-400 dark:text-indigo-400 pl-4">    "messages": &#123; "role": "user", "content": "Hello!" &#125; ]</span><br />
                <span className="text-slate-400 dark:text-slate-500 pl-4">  &#125;'</span><br />
                <br />
                <span className="text-emerald-400 dark:text-emerald-400">{"  → 200 OK | routed to gpt-5 | 142ms | $0.0004"}</span>
              </div>
            </div>
            <p className="mt-6 text-center text-slate-500 dark:text-slate-400 text-sm">
              One endpoint. Every model. Smart routing handled for you.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 md:py-32 relative">
        <div className="container-page">
          <div className="text-center mb-16">
            <h2 className="text-[2.75rem] md:text-[3.5rem] font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
              Built for teams shipping AI
            </h2>
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto font-light">
              From smart routing to spend controls, Nexovra handles the complexity so you can focus on building.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {features.map((feature, i) => (
              <Card
                key={feature.title}
                hover
                className="group relative overflow-hidden border-transparent hover:border-white/40 dark:hover:border-white/10"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 dark:from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 space-y-5 p-6 md:p-8">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-1 shadow-xl shadow-lg/25 group-hover:scale-110 transition-transform duration-300" style={{ background: `linear-gradient(135deg, ${feature.gradient})` }}>
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/30 dark:bg-white/5 border border-white/40 dark:border-white/10 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider backdrop-blur-sm">
                    {feature.badge}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-light">
                    {feature.desc}
                  </p>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-gradient-to-r transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-24 md:py-32 bg-slate-50/40 dark:bg-navy-900/20 border-y border-white/20 dark:border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-30 dark:opacity-60 [mask-image:radial-gradient(circle_at_center,white_40%,transparent_90%)]" />
        <div className="container-page">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {statItems.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.6 }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <span className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 dark:from-white via-brand-500 to-purple-600 tracking-tighter">
                    {stat.value}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{stat.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{stat.sub}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 md:py-40 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-brand-600/10 via-indigo-600/5 to-purple-600/10" />
        <div className="absolute inset-0 -z-10 [mask-image:radial-gradient(circle_at_center,transparent_60%,rgba(15,23,42,0.9)_100%)] dark:[mask-image:radial-gradient(circle_at_center,transparent_60%,#070c17_100%)]" />
        <div className="relative z-10 container-page">
          <div className="glass rounded-[2rem] p-8 md:p-12 text-center border border-white/40 dark:border-white/10 shadow-2xl">
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6">
              Ready to scale your inference?
            </h2>
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-xl mx-auto font-light leading-relaxed">
              Join the public beta and get your API key in seconds. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="w-full sm:w-auto shadow-2xl shadow-brand-500/35 flex items-center gap-2 group hover:scale-[1.02]">
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> Get started free
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto flex items-center gap-2 group hover:scale-[1.02]">
                <Globe className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> Talk to sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
