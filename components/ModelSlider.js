import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from './lib/cn.js';
import Card from './Card.js';
import Button from './Button.js';
import { ArrowLeft, ArrowRight, Bot, Play, Pause } from 'lucide-react';
import { formatUsd, formatTokens } from '../lib/api.js';

const breakpoints = [
  { minW: 1280, cardW: 430, visible: 4 },
  { minW: 1024, cardW: 390, visible: 3 },
  { minW: 640, cardW: 340, visible: 2 },
  { minW: 0, cardW: 260, visible: 1 },
];

const cardWidthFor = (w) => {
  if (w >= 1280) return 'w-[430px]';
  if (w >= 1024) return 'w-[390px]';
  if (w >= 640) return 'w-[340px]';
  return 'w-[260px]';
};

const blend = (input, output) => input * 0.75 + output * 0.25;
const discountPct = (baseline, offer) => {
  if (!baseline || !offer || baseline <= 0) return null;
  return Math.max(0, Math.min(100, (1 - offer / baseline) * 100));
};

/**
 * Motion slider that renders every AI model passed in.
 * - Staggered spring entrance, hover lift, tap press
 * * Scroll-snap track with prev/next controls and page dots
 * - Optional autoplay that pauses on hover
 */
export default function ModelSlider({
  models = [],
  autoplay = true,
  interval = 5000,
  showControls = true,
  showDots = true,
  title = 'All AI models',
  subtitle,
}) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  const [activePage, setActivePage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [hovered, setHovered] = useState(false);

  const bp = useMemo(
    () => breakpoints.find((b) => windowWidth >= b.minW) || breakpoints[breakpoints.length - 1],
    [windowWidth],
  );
  const visible = bp?.visible ?? 1;
  const cardW = bp?.cardW ?? 260;
  const pageCount = useMemo(() => Math.max(1, Math.ceil(models.length / visible)), [
    models.length,
    visible,
  ]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scrollToPage = useCallback(
    (page) => {
      setActivePage(page);
      const track = trackRef.current;
      if (!track) return;
      const target = track.children[page * visible];
      if (!target) return;
      const scrollContainer = track.parentElement;
      if (!scrollContainer) return;
      scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    },
    [visible],
  );

  const nextPage = useCallback(() => {
    const p = Math.min(activePage + 1, pageCount - 1);
    if (p !== activePage) scrollToPage(p);
  }, [activePage, pageCount, scrollToPage]);

  const prevPage = useCallback(() => {
    const p = Math.max(activePage - 1, 0);
    if (p !== activePage) scrollToPage(p);
  }, [activePage, scrollToPage]);

  useEffect(() => {
    if (!isPlaying || hovered || models.length === 0 || pageCount <= 1) return;
    const timer = setInterval(() => scrollToPage((activePage + 1) % pageCount), interval);
    return () => clearInterval(timer);
  }, [isPlaying, hovered, activePage, pageCount, models.length, interval, scrollToPage]);

  if (models.length === 0) {
    return (
      <section className="py-10 md:py-16">
        <div className="container-page">
          <h2 className="text-h1 text-slate-900 dark:text-white mb-2">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            {subtitle ?? 'No models available right now.'}
          </p>
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/30 p-12 text-center">
            <Bot className="h-10 w-10 mx-auto mb-3 text-slate-400" />
            <h3 className="text-slate-900 dark:text-white font-medium mb-1">No models found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Try adjusting your filters or check back soon.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10 md:py-16 bg-canvas dark:bg-navy-950">
      <div className="container-page">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-h1 text-slate-900 dark:text-white">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {subtitle ?? `${models.length} model${models.length !== 1 ? 's' : ''} available`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlaying((v) => !v)}
              className="h-9 px-3"
              aria-label={isPlaying ? 'Pause autoplay' : 'Resume autoplay'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <div
          ref={containerRef}
          className="relative"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="overflow-x-hidden [&::-webkit-scrollbar]:hidden">
            <motion.div
              ref={trackRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="flex gap-4 snap-x snap-mandatory"
            >
              {models.map((model) => {
                const best = model.bestOffer;
                const blendPrice = best ? blend(best.inputPerM, best.outputPerM) : null;
                const baseBlend = model.baseline ? blend(model.baseline.inputPerM, model.baseline.outputPerM) : null;
                const disc = baseBlend !== null && blendPrice !== null ? discountPct(baseBlend, blendPrice) : null;

                return (
                  <motion.div
                    key={model.id}
                    layout
                    initial={{ opacity: 0, x: 18, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 320,
                      damping: 26,
                    }}
                    whileHover={{ y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn('snap-start shrink-0 grow-0', cardWidthFor(windowWidth))}
                  >
                    <Card hover className="overflow-hidden h-full flex flex-col">
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-6 w-6 rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-200/60 dark:border-brand-800/30 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300">
                            {(model.provider?.name || 'M').charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {model.provider?.name || 'Provider'}
                          </span>
                          {(model.capabilities || [])
                            .slice(0, 2)
                            .map((cap) => (
                              <span
                                key={cap}
                                className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800 text-slate-600 dark:text-slate-300 uppercase tracking-tighter"
                              >
                                {cap}
                              </span>
                            ))}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 dark:text-white leading-tight">
                            {model.name}
                          </h3>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {model.id}
                          </p>
                        </div>
                        {disc !== null && disc > 0 && (
                          <span className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/30 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                            −{disc.toFixed(0)}% vs baseline
                          </span>
                        )}
                        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-navy-700 pt-3">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">
                              Price / 1M out
                            </span>
                            <div className="font-mono font-medium text-slate-900 dark:text-white">
                              {best ? formatUsd(best.outputPerM) : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">
                              Context
                            </span>
                            <div className="font-mono font-medium text-slate-900 dark:text-white">
                              {model.contextWindow ? formatTokens(model.contextWindow) : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button size="sm" asChild className="mt-5 w-full" variant="outline">
                        <Link href={`/market/${model.id}`}>View offers</Link>
                      </Button>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>

          {showControls && pageCount > 1 && (
            <>
              <motion.button
                disabled={activePage === 0}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={prevPage}
                aria-label="Previous slide"
                className={cn(
                  'absolute left-0 top-0 h-full z-20 flex items-center pl-4',
                  'bg-gradient-to-r from-white/70 via-transparent to-transparent dark:from-navy-950/70 dark:via-transparent',
                  'pointer-events-none group-hover:pointer-events-auto transition-opacity',
                  activePage === 0 ? 'opacity-40' : 'opacity-100 group-hover:opacity-100',
                )}
              >
                <span className="pointer-events-none"><ArrowLeft className="h-5 w-5" /></span>
              </motion.button>
              <motion.button
                disabled={activePage === pageCount - 1}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={nextPage}
                aria-label="Next slide"
                className={cn(
                  'absolute right-0 top-0 h-full z-20 flex items-center pr-4',
                  'bg-gradient-to-l from-white/70 via-transparent to-transparent dark:from-navy-950/70 dark:via-transparent',
                  'pointer-events-none group-hover:pointer-events-auto transition-opacity',
                  activePage === pageCount - 1 ? 'opacity-40' : 'opacity-100 group-hover:opacity-100',
                )}
              >
                <span className="pointer-events-none"><ArrowRight className="h-5 w-5" /></span>
              </motion.button>
            </>
          )}

          {showDots && pageCount > 1 && (
            <div className="mx-auto flex -mt-6 gap-2 justify-center">
              {Array.from({ length: pageCount }).map((_, p) => (
                <motion.button
                  key={p}
                  whileHover={{ scale: 1.3 }}
                  animate={{
                    scale: activePage === p ? 1.2 : 1,
                    backgroundColor: activePage === p ? '#2970FF' : 'transparent',
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  onClick={() => scrollToPage(p)}
                  aria-label={`Go to page ${p + 1}`}
                  aria-current={activePage === p ? 'true' : undefined}
                  className="w-2 h-2 rounded-full border border-slate-300 dark:border-navy-600/50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
