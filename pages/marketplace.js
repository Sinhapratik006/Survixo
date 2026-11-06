import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import { cn } from '../components/lib/cn.js';
import { api, formatUsd } from '../lib/api.js';

export default function MarketplacePage() {
  const router = useRouter();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(100000);
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!router.isReady) return;
      setLoading(true);
      try {
        const res = await api.get('/api/marketplace/listings?search=' + search + '&minPrice=' + minPrice + '&maxPrice=' + maxPrice + '&sort=' + sortBy);
        if (!cancelled) {
          setKeys(res.data.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
  }, [router.isReady, search, minPrice, maxPrice, sortBy]);

  const handleBuy = async (listingId) => {
    window.location.href = `/marketplace/${listingId}`;
  };

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 mb-8 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Search listings
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title or description..."
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Min Price (USD)
                </label>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Max Price (USD)
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  placeholder="100000"
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Sort by
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                >
                  <option value="newest">Newest first</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="popular">Most Popular</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                API Key Listings
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Browse available API key listings from certified sellers
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full">
                <div className="flex justify-center items-center py-12">
                  <span className="text-slate-500 dark:text-slate-400">Loading keys…</span>
                </div>
              </div>
            ) : keys.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl text-slate-500 dark:text-slate-400">••••</span>
                </div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">No listings yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No API key listings are currently available. Check back later or become a seller to create your own listing.
                </p>
              </div>
            ) : keys.map((key) => (
              <div
                key={key.id}
                className="group hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors rounded-lg border border-slate-200 dark:border-navy-700 overflow-hidden"
              >
                <div className="p-5 flex flex-col">
                  <h3 className="text-base font-medium text-slate-900 dark:text-white truncate">{key.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-3">{key.description || 'No description'}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {formatUsd(key.priceUsd)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      for {formatUsd(key.creditValueUsd)} of API credits
                    </span>
                    <span
                      className={`inline-block align-middle px-2 py-1 rounded text-xs font-bold ${
                        key.status === 'ACTIVE'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/30 dark:border-emerald-900/30'
                          : 'bg-slate-200 dark:bg-navy-700 text-slate-500 border border-slate-200 dark:border-navy-700'
                      }`}
                    >
                      {key.status}
                    </span>
                  </div>
                </div>
                <div className="p-3 border-t border-slate-200 dark:border-navy-700">
                  <div className="flex items-center justify-between">
                    <a
                      href="/marketplace/{key.id}"
                      className="text-sm text-slate-600 dark:text-slate-300 hover:underline transition-colors"
                    >
                      View Details
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBuy(key.id)}
                      disabled={key.status !== 'active'}
                    >
                      Buy Now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center text-slate-500 dark:text-slate-400">
            {/* Pagination controls */}
          </div>
        </div>
      </div>
    </div>
  );
}