import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import { cn } from '../../components/lib/cn.js';
import { api } from '../../lib/api.js';

export default function SellerDashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.location.pathname.includes('/seller')) return;
      setLoading(true);
      try {
        const res = await api.get('/api/marketplace/my-listings');
        if (!cancelled) {
          setListings(res.data.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    // Navigate to create listing page or show create dialog
    window.location.href = '/seller/create';
  };

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 mb-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Seller Dashboard
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Manage your API key listings and earnings
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => window.location.href = '/seller/create'}
              >
                Create Key Listing
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="h-96 flex items-center justify-center">
              <span className="text-slate-500 dark:text-slate-400">Loading listings…</span>
            </div>
          ) : listings.length === 0 ? (
            <div className="py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl text-slate-500 dark:text-slate-400">••••</span>
              </div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">No listings yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Create your first API key listing to start selling on the marketplace.
              </p>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/seller/create'}
              >
                Create Your First Listing
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <div
                  key={listing.id}
                  className="group hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors rounded-lg border border-slate-200 dark:border-navy-700"
                >
                  <div className="p-4">
                    <h3 className="text-base font-medium text-slate-900 dark:text-white truncate">
                      {listing.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {listing.description || 'No description'}
                    </p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ${formatUsd(listing.priceUsd)} / 1M tokens
                      </span>
                      <Badge
                        variant={listing.status === 'active' ? 'default' : 'secondary'}
                        size="sm"
                      >
                        {listing.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 border-t border-slate-200 dark:border-navy-700">
                    <a
                      href="/seller/listing/{listing.id}"
                      className="text-sm text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                    >
                      View Details
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.href = '/seller/listing/' + listing.id}
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}