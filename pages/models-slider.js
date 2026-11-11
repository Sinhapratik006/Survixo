import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ModelSlider from '../components/ModelSlider';
import { api } from '../lib/api.js';

export default function ModelsSliderPage() {
  const [models, setModels] = useState([]);
  const [total, setTotal] = useState(0);
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
          setTotal(all.length || total);
        }
      } catch (e) {
        console.error(e);
        setModels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        <Navbar />
        <section className="py-12">
          <div className="container-page">
            <div className="rounded-2xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/50 p-12 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">
                Loading AI models…
              </p>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />
      <section className="pb-12 md:pb-16">
        <div className="container-page">
          <ModelSlider
            models={models}
            title="Every AI model"
            subtitle={`${total} open offers from independent sellers`}
          />
        </div>
      </section>
      <Footer />
    </div>
  );
}
