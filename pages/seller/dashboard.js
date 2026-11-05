import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Badge from '../../components/ui/badge';
import { Trash2 } from 'lucide-react';
import { cn } from '../../components/lib/cn.js';
import { api, formatUsd } from '../../lib/api.js';
import { sellerPayoutFromBuyerPrice } from '../../lib/pricing.js';

export default function SellerDashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');

  // Require a session — signed-out visitors go to /login and come back here,
  // instead of seeing an empty dashboard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        // /api/auth/me answers 200 with { user: null } when signed out,
        // so check the payload rather than relying on a thrown error.
        if (res.data && res.data.user) setCheckingAuth(false);
        else window.location.href = '/login?next=/seller/dashboard';
      } catch (e) {
        if (cancelled) return;
        if (e.status === 401 || e.status === 403) {
          window.location.href = '/login?next=/seller/dashboard';
        } else {
          setCheckingAuth(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    let cancelled = false;
    (async () => {
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
    return () => { cancelled = true; };
  }, [checkingAuth]);

  const handleCreate = async (e) => {
    e.preventDefault();
    // Navigate to create listing page or show create dialog
    window.location.href = '/seller/create';
  };

  // A listing with no orders is removed for real. One with orders can't be
  // destroyed (buyers hold delivered keys, payout records must survive), so
  // the API archives it instead and we say so.
  const handleDelete = async (listing) => {
    setDeletingId(listing.id);
    setDeleteMsg('');
    try {
      const res = await api.delete(`/api/marketplace/listings/${listing.id}`);
      const d = res.data || {};
      if (d.deleted) {
        setListings((prev) => prev.filter((l) => l.id !== listing.id));
        setDeleteMsg(`“${listing.title}” was deleted.`);
      } else {
        setListings((prev) =>
          prev.map((l) => (l.id === listing.id ? { ...l, status: 'ARCHIVED' } : l)),
        );
        setDeleteMsg(
          `“${listing.title}” has ${d.orderCount} order${d.orderCount === 1 ? '' : 's'}, so it was archived instead of deleted.`,
        );
      }
    } catch (e) {
      setDeleteMsg(e.message || 'Failed to delete this listing.');
    } finally {
      setDeletingId('');
      setConfirmDeleteId('');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking your session…</p>
        </div>
      </div>
    );
  }

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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/seller/payouts'}
                >
                  Payouts
                </Button>
                <Button
                  variant="primary"
                  onClick={() => window.location.href = '/seller/create'}
                >
                  Create Key Listing
                </Button>
              </div>
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
            <>
              {deleteMsg && (
                <div className="mb-4 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/50 p-3 text-sm text-slate-700 dark:text-slate-300">
                  {deleteMsg}
                </div>
              )}
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
                        You get {formatUsd(sellerPayoutFromBuyerPrice(listing.priceUsd))} · buyer pays {formatUsd(listing.priceUsd)}
                      </span>
                      <Badge
                        variant={listing.status === 'ACTIVE' ? 'default' : 'secondary'}
                        size="sm"
                      >
                        {listing.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 border-t border-slate-200 dark:border-navy-700 flex items-center justify-between gap-2">
                    <a
                      href={`/seller/listing/${listing.id}`}
                      className="text-sm text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                    >
                      View Details
                    </a>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { window.location.href = `/seller/listing/${listing.id}`; }}
                      >
                        Manage
                      </Button>
                      {confirmDeleteId !== listing.id ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => { setDeleteMsg(''); setConfirmDeleteId(listing.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingId === listing.id}
                            onClick={() => setConfirmDeleteId('')}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={deletingId === listing.id}
                            onClick={() => handleDelete(listing)}
                          >
                            {deletingId === listing.id ? 'Deleting…' : 'Confirm'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}