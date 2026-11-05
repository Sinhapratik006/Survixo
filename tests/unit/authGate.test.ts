/**
 * The gate in pages/_app.js lets `isPublicPath` decide who needs a session.
 * Getting these wrong is either a hole (a signed-out visitor inside the app)
 * or a lockout (the landing page demanding a login), so the list is pinned
 * here.
 */
import { describe, expect, it } from 'vitest';
import { isPublicPath } from '../../lib/authGate.js';

describe('isPublicPath', () => {
  it('leaves marketing, auth and public browse routes open', () => {
    const publicPaths = [
      '/',
      '/login',
      '/signup',
      '/docs',
      '/legal',
      '/calculator',
      '/models',
      '/marketplace',
      '/market/[id]', // public model detail
      '/analytics', // market-wide stats on the public router
    ];
    for (const p of publicPaths) {
      expect(isPublicPath(p), `${p} should be public`).toBe(true);
    }
  });

  it('requires a session for the app, buyer and seller routes', () => {
    const gatedPaths = [
      '/dashboard',
      '/app',
      '/app/keys',
      '/app/usage',
      '/buyer/marketplace', // orders + checkout live behind requireOrg()
      '/seller/dashboard',
      '/seller/create',
      '/seller/listing/[id]',
    ];
    for (const p of gatedPaths) {
      expect(isPublicPath(p), `${p} should be gated`).toBe(false);
    }
  });

  it('keeps similar-looking routes apart', () => {
    // `/market` prefix must cover its own subroutes without swallowing the
    // storefront, and `/` must not make every path public.
    expect(isPublicPath('/market/[id]')).toBe(true);
    expect(isPublicPath('/marketplace')).toBe(true);
    expect(isPublicPath('/markets')).toBe(false);
    expect(isPublicPath('/marketing')).toBe(false);
    expect(isPublicPath('/dashboard')).toBe(false);
  });
});
