import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import ModelSlider from '../components/ModelSlider';
import { LogoMark } from '../components/Logo';
import { api, formatUsd } from '../lib/api.js';

const blend = (input, output) => input * 0.75 + output * 0.25;

const facts = [
  { value: '50+', label: 'models, one key' },
  { value: '−40%', label: 'avg. vs list price' },
  { value: '$0', label: 'for failed requests' },
];

const ways = [
  {
    n: '01',
    title: 'API',
    desc: 'One OpenAI-compatible endpoint. Swap the base URL, keep your SDK.',
    href: '/docs',
    go: 'Read the docs',
    vis: 'code',
  },
  {
    n: '02',
    title: 'Marketplace',
    desc: 'Compare live seller offers per model and pin the one you want.',
    href: '/marketplace',
    go: 'Browse offers',
    vis: 'market',
  },
  {
    n: '03',
    title: 'Sell inference',
    desc: 'List capacity, set your own price per million tokens, get paid out.',
    href: '/seller/dashboard',
    go: 'Start selling',
    vis: 'sell',
  },
];

const flow = [
  { lbl: 'Request', title: 'You call /v1/chat', desc: 'Standard OpenAI payload, any model id.' },
  { lbl: 'Route', title: 'We pick the offer', desc: 'Cheapest healthy seller that meets your latency budget.' },
  { lbl: 'Fallback', title: 'Retry on failure', desc: 'A failing seller is skipped. You are never billed for it.', tone: 'x' },
  { lbl: 'Settle', title: 'Pay per token', desc: 'Exact usage, debited from your balance.', tone: 'y', amt: '$0.0004' },
];

const enterprise = [
  { lbl: 'Controls', title: 'Budget guards', desc: 'Per-key spend caps and real-time alerts.' },
  { lbl: 'Access', title: 'SSO & roles', desc: 'Team keys with scoped permissions.' },
  { lbl: 'Compliance', title: 'SOC 2 Type II', desc: 'GDPR & CCPA ready, audit logs included.' },
  { lbl: 'Visibility', title: 'Live analytics', desc: 'Tokens, latency and cost per request.' },
];

const faqs = [
  {
    q: 'Is it really OpenAI-compatible?',
    a: 'Yes. Point any OpenAI SDK at our base URL and use your ApiTradeX key. Chat completions, streaming and tool calls work as-is.',
  },
  {
    q: 'Who are the sellers?',
    a: 'Independent providers who list capacity for a model at their own price. Every offer is health-checked before it can receive traffic.',
  },
  {
    q: 'What happens when a seller fails?',
    a: 'The router retries the next eligible offer automatically. Failed attempts are never charged to you.',
  },
  {
    q: 'How do I pay?',
    a: 'Top up a prepaid balance and usage is debited per token. You can set hard caps on every key.',
  },
  {
    q: 'Can I sell my own inference?',
    a: 'Yes. Create a listing from the seller dashboard, set input and output prices, and request payouts once you have earnings.',
  },
];

function SectionHead({ num, label, title, sub, children }) {
  return (
    <div className="grid md:grid-cols-2 gap-3.5 md:gap-10 items-end mb-10">
      <div>
        <div className="num">
          {num} / {label}
        </div>
        <h2 className="h-section mt-3.5">
          {title.map((line, i) => (
            <span key={i} className={i > 0 ? 'block text-ink-muted' : 'block'}>
              {line}
            </span>
          ))}
        </h2>
      </div>
      <div>
        {sub && <p className="font-mono text-[14.5px] leading-[1.7] text-ink-muted max-w-[520px]">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function WayVisual({ kind }) {
  if (kind === 'code') {
    return (
      <pre className="px-5 py-[18px] font-mono text-[12.5px] leading-[1.75] text-[#cfcfcb] whitespace-pre overflow-hidden">
        <span className="text-ink-faint"># drop-in for the OpenAI SDK</span>
        {'\n'}
        <span className="text-white">from</span> openai <span className="text-white">import</span> OpenAI
        {'\n\n'}client = OpenAI({'\n'}  base_url=<span className="text-[#f0a77f]">"https://api.apitradex.local/v1"</span>,{'\n'}  api_key=<span className="text-[#f0a77f]">"atx_..."</span>,{'\n'}){'\n'}client.chat.completions.create({'\n'}  model=<span className="text-[#f0a77f]">"gpt-5"</span>, messages=[...]{'\n'})
      </pre>
    );
  }
  if (kind === 'market') {
    const rows = [
      ['seller-a', '$1.80', 'ok'],
      ['seller-b', '$2.10', 'ok'],
      ['seller-c', '$2.40', 'slow'],
    ];
    return (
      <div className="p-5 font-mono text-[12.5px]">
        <div className="lbl text-[10.5px] text-ink-faint grid grid-cols-3 pb-2 border-b border-line">
          <span>Seller</span>
          <span className="text-right">/1M out</span>
          <span className="text-right">Health</span>
        </div>
        {rows.map(([s, p, h], i) => (
          <div key={s} className="grid grid-cols-3 py-2.5 border-b border-[#1a1a1a] text-ink-2">
            <span className={i === 0 ? 'text-ink' : ''}>{s}</span>
            <span className="text-right">{p}</span>
            <span className={`text-right ${h === 'ok' ? 'text-ok' : 'text-brand-500'}`}>{h}</span>
          </div>
        ))}
        <div className="mt-3 text-ink-faint">→ routed to seller-a</div>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col justify-center gap-2.5 p-5">
      <div className="self-end max-w-[84%] px-3 py-2 text-[13px] border border-line-2 bg-[#1a1a1a]">List llama-4 at $0.90 / 1M out</div>
      <div className="max-w-[84%] px-3 py-2 text-[13px] border border-line-2 text-ink-2">
        Listing live. <b className="text-brand-500">1,204</b> requests routed in the last hour.
      </div>
      <div className="self-end max-w-[84%] px-3 py-2 text-[13px] border border-line-2 bg-[#1a1a1a]">Request payout</div>
      <div className="max-w-[84%] px-3 py-2 text-[13px] border border-line-2 text-ink-2">
        <b className="text-ok">$312.40</b> sent to your wallet.
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const first = await api.get('/api/models', { query: {} });
        const data = first.data.data || [];
        const total = first.data.total || 0;

        // Fetch every model when the default page doesn't return them all.
        let all = data;
        if (total > data.length && !cancelled) {
          const second = await api.get('/api/models', { query: { limit: total } });
          all = second.data.data || data;
        }

        if (!cancelled) {
          setModels(all);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live price table: models that have an offer, cheapest blended price first.
  const priced = useMemo(
    () =>
      models
        .filter((m) => m.bestOffer)
        .map((m) => {
          const ours = blend(m.bestOffer.inputPerM, m.bestOffer.outputPerM);
          const base = m.baseline ? blend(m.baseline.inputPerM, m.baseline.outputPerM) : null;
          const save = base && base > 0 ? Math.max(0, (1 - ours / base) * 100) : null;
          return { m, base, save };
        })
        .slice(0, 8),
    [models],
  );

  const makers = useMemo(() => {
    const names = [...new Set(models.map((m) => m.provider?.name).filter(Boolean))];
    return names.length >= 4
      ? names.slice(0, 8)
      : ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral', 'DeepSeek', 'xAI', 'Qwen'];
  }, [models]);

  const consoleRows = priced.length
    ? priced.slice(0, 5).map(({ m }) => ({ name: m.name, price: formatUsd(m.bestOffer.outputPerM) }))
    : [
        { name: 'gpt-5', price: '$8.00' },
        { name: 'claude-opus-4', price: '$60.00' },
        { name: 'gemini-2.5-pro', price: '$8.00' },
        { name: 'llama-4-maverick', price: '$0.60' },
        { name: 'deepseek-v3', price: '$0.90' },
      ];

  return (
    <div className="min-h-screen text-ink">
      <div className="flex justify-center items-center gap-3.5 px-4 py-[9px] bg-black border-b border-line text-[13.5px] text-center">
        <span className="w-[7px] h-[7px] bg-brand-500 inline-block shrink-0" />
        <span>Public beta: every new account gets free credits to try any model.</span>
        <Link
          href="/calculator"
          className="hidden md:inline-block font-mono text-xs uppercase tracking-[0.05em] border border-line-2 px-2 py-[3px] hover:text-ink text-ink-2"
        >
          See prices
        </Link>
      </div>

      <Navbar />

      <main id="main" className="container-page">
        {/* ── Hero ── */}
        <section className="grid lg:grid-cols-[.92fr_1.08fr] gap-10 lg:gap-12 items-center pt-9 pb-12 lg:pt-[70px] lg:pb-20">
          <div>
            <div className="inline-flex border border-line-2 font-mono text-[11px] md:text-xs uppercase tracking-[0.07em]">
              {[
                ['API', '/docs'],
                ['Marketplace', '/marketplace'],
                ['Sell', '/seller/dashboard'],
              ].map(([label, href], i) => (
                <Link
                  key={label}
                  href={href}
                  className={`px-2.5 md:px-3.5 py-[7px] md:py-2 border-r border-line-2 last:border-r-0 ${
                    i === 0 ? 'bg-ink text-[#0a0a0a]' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>

            <h1 className="h-display mt-[26px]">
              Every AI model.
              <span className="block text-ink-muted">One API. Lowest price.</span>
            </h1>

            <p className="lead mt-6 max-w-[520px]">
              An OpenAI-compatible endpoint that routes each request to the cheapest healthy seller. Smart
              fallback, budget guards, and a marketplace where anyone can sell inference.
            </p>

            <div className="mt-[34px] flex flex-wrap gap-3">
              <Button onClick={() => router.push('/signup')}>Get API key →</Button>
              <Button variant="outline" onClick={() => router.push('/marketplace')}>
                Open marketplace
              </Button>
              <Link
                href="/messages"
                className="inline-flex items-center h-[42px] px-2 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted hover:text-ink"
              >
                Talk to sales
              </Link>
            </div>

            <div className="mt-[34px] pt-[18px] border-t border-line grid grid-cols-3 md:inline-grid md:grid-cols-[repeat(3,auto)]">
              {facts.map((f) => (
                <div key={f.label} className="pr-2.5 mr-2.5 md:pr-7 md:mr-7 border-r border-line last:border-r-0">
                  <b className="block font-mono font-semibold text-lg md:text-[22px]">{f.value}</b>
                  <span className="text-[12.5px] text-ink-muted">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Console mock */}
          <div className="border border-line-2 bg-[#0a0a0a] grid md:grid-cols-[170px_1fr] md:min-h-[520px] shadow-[0_40px_120px_#000]">
            <aside className="hidden md:flex flex-col gap-1 border-r border-line px-3 py-4">
              <div className="flex items-center gap-2 mx-1 mb-4 font-mono font-bold text-[13px] tracking-[0.08em]">
                <LogoMark size={18} /> APITRADEX
              </div>
              {['Overview', 'Keys', 'Usage', 'Marketplace', 'Billing'].map((s, i) => (
                <span
                  key={s}
                  className={`flex items-center gap-2.5 px-2 py-[7px] text-[13px] ${
                    i === 0 ? 'bg-navy-800 text-ink border border-line' : 'text-ink-muted border border-transparent'
                  }`}
                >
                  <span className="w-2.5 h-2.5 border border-ink-faint" />
                  {s}
                </span>
              ))}
              <div className="mt-auto border border-line p-2.5 text-xs text-ink-muted">
                Balance
                <b className="block mt-0.5 font-mono font-semibold text-base text-ink">$248.10</b>
              </div>
            </aside>

            <div className="p-4 flex flex-col gap-3 min-w-0">
              <div className="flex justify-between items-center border border-line px-3.5 py-3">
                <div>
                  <b className="font-mono font-semibold text-[15px] tracking-[0.04em] uppercase">Overview</b>
                  <small className="block text-xs text-ink-muted">Last 24 hours</small>
                </div>
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                  <span className="live-dot" /> Live
                </span>
              </div>

              <div className="grid grid-cols-3 border border-line">
                {[
                  ['Requests', '12.4k', '+8.2%'],
                  ['Spend', '$41.92', '−38% vs list'],
                  ['Uptime', '99.9%', 'all routes'],
                ].map(([l, v, d]) => (
                  <div key={l} className="px-3.5 py-3 border-r border-line last:border-r-0 min-w-0">
                    <span className="lbl text-[10.5px]">{l}</span>
                    <b className="block mt-1.5 font-mono font-semibold text-[17px] md:text-[22px]">{v}</b>
                    <em className="not-italic font-mono text-[11px] text-ok">{d}</em>
                  </div>
                ))}
              </div>

              <div className="border border-line flex-1">
                <div className="grid grid-cols-[1.6fr_.9fr_.7fr] md:grid-cols-[1.5fr_.8fr_.8fr_.7fr] gap-2.5 px-3.5 py-[9px] border-b border-line font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                  <span>Model</span>
                  <span>Status</span>
                  <span className="hidden md:block">Latency</span>
                  <span className="text-right">/1M out</span>
                </div>
                {consoleRows.map((r, i) => (
                  <div
                    key={r.name + i}
                    className="grid grid-cols-[1.6fr_.9fr_.7fr] md:grid-cols-[1.5fr_.8fr_.8fr_.7fr] gap-2.5 px-3.5 py-[9px] border-b border-[#1a1a1a] last:border-b-0 font-mono text-[12.5px] text-ink-2 items-center"
                  >
                    <span className="font-sans text-ink truncate">{r.name}</span>
                    <span className={i === 2 ? 'text-brand-500' : 'text-ok'}>{i === 2 ? 'fallback' : 'ok'}</span>
                    <span className="hidden md:block">{[142, 188, 231, 96, 174][i % 5]}ms</span>
                    <span className="text-right">{r.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Makers strip ── */}
      <div className="border-y border-line grid grid-cols-4 md:grid-cols-8">
        {makers.map((name) => (
          <span
            key={name}
            className="py-4 md:py-[26px] text-center font-mono text-[11px] md:text-[13px] uppercase tracking-[0.1em] text-ink-muted border-r border-line border-b md:border-b-0 truncate px-2"
          >
            {name}
          </span>
        ))}
      </div>

      <div className="container-page">
        {/* ── 01 Pricing ── */}
        <section className="pt-[70px] md:pt-[110px]">
          <SectionHead
            num="01"
            label="Pricing"
            title={['Live prices.', 'Updated every request.']}
            sub="The best open offer per model, blended 75/25 input/output per 1M tokens, compared with the provider's list price."
          />
          <div className="border border-line-2 bg-[#0a0a0a]">
            <div className="flex justify-between items-center px-4 py-3 border-b border-line">
              <span className="flex items-center gap-2 lbl">
                <span className="live-dot" /> Live offers
              </span>
              <span className="lbl hidden md:inline">USD / 1M tokens</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                    <th className="text-left font-normal px-2.5 md:px-[18px] py-3 border-b border-line">Model</th>
                    <th className="text-right font-normal px-2.5 md:px-[18px] py-3 border-b border-line hidden md:table-cell">List</th>
                    <th className="text-right font-normal px-2.5 md:px-[18px] py-3 border-b border-line">Ours</th>
                    <th className="text-right font-normal px-2.5 md:px-[18px] py-3 border-b border-line">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={4} className="px-[18px] py-6 font-mono text-sm text-ink-muted">
                        Loading offers…
                      </td>
                    </tr>
                  )}
                  {!loading && priced.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-[18px] py-6 font-mono text-sm text-ink-muted">
                        No live offers right now.
                      </td>
                    </tr>
                  )}
                  {priced.map(({ m, base, save }) => (
                    <tr key={m.id} className="font-mono text-[15px] text-ink-muted">
                      <td className="text-left px-2.5 md:px-[18px] py-3 md:py-4 border-b border-[#191919]">
                        <Link href={`/market/${m.id}`} className="font-sans text-base font-medium text-ink hover:underline">
                          {m.name}
                        </Link>
                        <small className="block md:inline md:ml-2.5 font-mono text-xs text-ink-faint">
                          {m.provider?.name}
                        </small>
                      </td>
                      <td className="text-right px-2.5 md:px-[18px] py-3 md:py-4 border-b border-[#191919] hidden md:table-cell">
                        {base ? <s className="decoration-brand-500">{formatUsd(base)}</s> : '—'}
                      </td>
                      <td className="text-right px-2.5 md:px-[18px] py-3 md:py-4 border-b border-[#191919] text-ink font-semibold text-[17px]">
                        {formatUsd(blend(m.bestOffer.inputPerM, m.bestOffer.outputPerM))}
                      </td>
                      <td className="text-right px-2.5 md:px-[18px] py-3 md:py-4 border-b border-[#191919]">
                        {save ? (
                          <span className="inline-block border border-ok/40 text-ok text-xs px-2 py-0.5">
                            −{save.toFixed(0)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2 px-[18px] py-3 font-mono text-xs text-ink-muted">
              <span>Failed requests are never billed.</span>
              <Link href="/marketplace" className="hover:underline hover:text-ink">
                All models →
              </Link>
            </div>
          </div>
        </section>

        {/* ── 02 Ways in ── */}
        <section className="pt-[70px] md:pt-[110px]">
          <SectionHead num="02" label="Ways in" title={['Three ways in.', 'One balance.']} />
          <div className="grid md:grid-cols-3 border border-line-2">
            {ways.map((w) => (
              <div key={w.n} className="flex flex-col border-b md:border-b-0 md:border-r border-line-2 last:border-0">
                <div className="px-[22px] pt-[22px]">
                  <span className="lbl">{w.n}</span>
                  <h3 className="mt-2.5 text-2xl font-bold tracking-[-0.03em]">{w.title}</h3>
                  <p className="mt-1.5 text-[14.5px] text-ink-muted md:min-h-[66px]">{w.desc}</p>
                </div>
                <div className="mt-5 border-t border-line h-[240px] bg-[#090909] overflow-hidden">
                  <WayVisual kind={w.vis} />
                </div>
                <Link
                  href={w.href}
                  className="flex justify-between px-[22px] py-3.5 border-t border-line font-mono text-[12.5px] uppercase tracking-[0.06em] hover:bg-navy-900"
                >
                  {w.go} <span>→</span>
                </Link>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* ── 03 Catalogue ── (ModelSlider brings its own container) */}
      <div className="pt-[30px] md:pt-[60px]">
        <ModelSlider models={models} eyebrow="03 / Catalogue" title="Every AI model" subtitle="Open offers from independent sellers" autoplay interval={5000} />
      </div>

      <div className="container-page">

        {/* ── 04 Routing ── */}
        <section className="pt-[70px] md:pt-[110px]">
          <SectionHead
            num="04"
            label="Routing"
            title={['How a request', 'gets routed.']}
            sub="Every call is matched to the cheapest healthy offer. If it fails, the next one takes over, and you are only charged for the one that answered."
          />
          <div className="grid md:grid-cols-4 border border-line-2">
            {flow.map((f, i) => (
              <div
                key={f.lbl}
                className="relative p-6 min-h-[150px] border-b md:border-b-0 md:border-r border-line-2 last:border-0"
              >
                <span className={`lbl ${f.tone === 'x' ? 'text-rose-400' : f.tone === 'y' ? 'text-ok' : ''}`}>
                  {String(i + 1).padStart(2, '0')} · {f.lbl}
                </span>
                <b className="block mt-2.5 text-lg">{f.title}</b>
                <p className="mt-1 text-[13.5px] text-ink-muted">{f.desc}</p>
                {f.amt && <div className="mt-2 font-mono font-semibold text-[30px]">{f.amt}</div>}
                {i < flow.length - 1 && (
                  <span className="absolute z-10 bg-[#070707] px-[3px] py-0.5 font-mono text-sm text-ink-muted left-1/2 -bottom-3 -translate-x-1/2 md:left-auto md:-right-[11px] md:top-1/2 md:bottom-auto md:translate-x-0 md:-translate-y-1/2">
                    <span className="md:hidden">↓</span>
                    <span className="hidden md:inline">→</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 05 Enterprise ── */}
        <section className="pt-[70px] md:pt-[110px]">
          <SectionHead num="05" label="Enterprise" title={['Built for teams', 'shipping AI.']} />
          <div className="grid md:grid-cols-2 border border-line-2">
            <div className="grid sm:grid-cols-2 md:border-r border-line-2">
              {enterprise.map((e, i) => (
                <div
                  key={e.title}
                  className={`p-6 border-line border-b ${i % 2 === 0 ? 'sm:border-r' : ''} ${i >= 2 ? 'sm:border-b-0' : ''}`}
                >
                  <span className="lbl text-brand-500">{e.lbl}</span>
                  <b className="block mt-2.5 text-[17px] tracking-[-0.01em]">{e.title}</b>
                  <p className="mt-1 text-[13.5px] text-ink-muted">{e.desc}</p>
                </div>
              ))}
            </div>
            <div className="p-[22px] md:p-[30px] bg-[#0a0a0a] border-t md:border-t-0 border-line-2">
              <h3 className="text-[26px] font-bold tracking-[-0.03em]">Talk to us</h3>
              <p className="mt-1.5 text-sm text-ink-muted">Volume pricing, private routes and dedicated capacity.</p>
              <ul className="mt-[18px] border-t border-line">
                {['Committed-use discounts', 'Private seller pools', 'Invoiced billing', 'Named support engineer'].map(
                  (t, i) => (
                    <li key={t} className="flex gap-3 py-3 border-b border-line text-sm text-ink-2">
                      <b className="font-mono text-xs text-brand-500 min-w-[22px] pt-0.5">{String(i + 1).padStart(2, '0')}</b>
                      {t}
                    </li>
                  ),
                )}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => router.push('/messages')}>Contact sales →</Button>
                <Button variant="outline" onClick={() => router.push('/calculator')}>
                  Estimate cost
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── 06 FAQ ── */}
        <section className="pt-[70px] md:pt-[110px]">
          <SectionHead num="06" label="FAQ" title={['Questions,', 'answered.']} />
          <div className="grid md:grid-cols-2 gap-px bg-line-2 border border-line-2">
            {faqs.map((f, i) => (
              <details
                key={f.q}
                className={`group bg-[#070707] p-6 ${i === faqs.length - 1 && faqs.length % 2 ? 'md:col-span-2' : ''}`}
              >
                <summary className="list-none cursor-pointer relative pr-8 font-mono text-sm leading-normal uppercase tracking-[0.03em] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="absolute right-0 -top-0.5 text-lg text-ink-muted group-open:hidden">+</span>
                  <span className="absolute right-0 -top-0.5 text-lg text-ink-muted hidden group-open:inline">−</span>
                </summary>
                <p className="mt-3.5 text-[14.5px] leading-[1.65] text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <div className="mt-[70px] md:mt-[110px] border border-line-2 bg-[#0a0a0a] p-[26px] md:p-11 flex flex-wrap justify-between items-center gap-[30px]">
          <div>
            <h2 className="text-[30px] md:text-[40px] font-bold tracking-[-0.04em] leading-[1.02]">Get your API key.</h2>
            <p className="mt-2 font-mono text-[13.5px] text-ink-muted">Free credits on signup. No card required.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => router.push('/signup')}>Start free →</Button>
            <Button variant="outline" onClick={() => router.push('/docs')}>
              Read the docs
            </Button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
