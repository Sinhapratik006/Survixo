import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Card from '../components/Card';
import { FileText, ShieldCheck, Clock } from 'lucide-react';

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <section className="py-16">
        <div className="container-page">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-navy-400">Terms of Service</span>
            </div>
            <h1 className="text-h1 text-slate-900 dark:text-white mb-4">Terms of Service</h1>
            <p className="text-slate-600 dark:text-slate-300 mb-8 flex items-center gap-2 text-sm">
              <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
              Last updated: October 2026
            </p>

            <div className="space-y-8">
              <section className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">API Access</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Nexovra provides a unified OpenAI-compatible API for AI inference. API keys are issued per
                      account and must be kept confidential. Do not share keys in client-side code or public
                      repositories.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Billing</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Usage is metered per request and billed monthly. Budget guards can be configured to prevent
                      overages. All prices are in USD and exclude applicable taxes unless stated otherwise.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Seller Ecosystem</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Model sellers set their own pricing and earn a revenue share from inference traffic. Payouts
                      are processed monthly and subject to platform fees.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Acceptable Use</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      You may not use the service for illegal activity, spam, or to train competing foundation
                      models without authorization. We reserve the right to suspend accounts that violate these
                      terms.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0 mt-0.5">
                    5
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Limitation of Liability</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Nexovra is not liable for indirect or consequential damages arising from use of the service.
                      Service is provided "as is" without warranties of any kind.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <Card className="mt-12 p-6 border-slate-100 dark:border-navy-800/30 bg-slate-50 dark:bg-navy-900/30">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Questions?</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Contact our legal team at legal@nexovra.local for questions about these terms.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
