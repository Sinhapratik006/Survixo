/**
 * Route policy for the session gate in `pages/_app.js`.
 *
 * Everything not listed here requires a signed-in session: the gate verifies
 * `/api/auth/me` and bounces signed-out visitors to `/login?next=<page>` so
 * they come straight back after signing in. The APIs themselves are the real
 * boundary (`requireOrg()` on every user-scoped router) — this only makes the
 * UI stop pretending a signed-out visitor can use the app.
 *
 * Notes on similar-looking routes:
 * - `/market` is a prefix for `/market/[id]` (public model detail), while
 *   `/marketplace` is the public browse storefront (its listing API answers
 *   without a session).
 * - `/buyer/marketplace` (orders, checkout) is NOT under `/marketplace` and
 *   stays gated.
 * - `/analytics` serves market-wide aggregate stats from the public router.
 */
export const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/docs',
  '/legal',
  '/calculator',
  '/models',
  '/marketplace',
  '/market',
  '/analytics',
];

/** True when the route renders without a session. */
export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)));
}
