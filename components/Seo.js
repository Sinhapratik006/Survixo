import Head from 'next/head';
import { useRouter } from 'next/router';
import { SITE_URL, SITE_NAME, DEFAULT_IMAGE, LAST_UPDATED, ORGANIZATION_LD, routeMeta } from '../lib/seo.js';

/**
 * Site-wide <head>: title, description, canonical, robots, Open Graph and
 * JSON-LD. Rendered once from `_app.js`. Pages can pass extra JSON-LD nodes
 * through `jsonLd` (e.g. the home page's FAQPage).
 */
export default function Seo({ jsonLd = [] }) {
  const router = useRouter();
  const meta = routeMeta(router.pathname);

  // Dynamic routes are prerendered with the pattern ("/market/[id]") as the
  // path; only emit a canonical once the real path is known.
  const isDynamic = router.pathname.includes('[');
  const path = isDynamic && !router.isReady ? null : router.asPath.split(/[?#]/)[0];
  const canonical = path ? `${SITE_URL}${path === '/' ? '/' : path.replace(/\/$/, '')}` : null;

  const graph = meta.index
    ? [
        ORGANIZATION_LD,
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          url: SITE_URL,
          name: SITE_NAME,
          publisher: { '@id': `${SITE_URL}/#organization` },
        },
        {
          '@type': 'WebPage',
          ...(canonical ? { '@id': canonical, url: canonical } : {}),
          name: meta.title,
          description: meta.description,
          isPartOf: { '@id': `${SITE_URL}/#website` },
          author: { '@id': `${SITE_URL}/#organization` },
          publisher: { '@id': `${SITE_URL}/#organization` },
          datePublished: '2026-01-01',
          dateModified: LAST_UPDATED,
        },
        ...jsonLd,
      ]
    : null;

  return (
    <Head>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content={meta.index ? 'index, follow' : 'noindex, nofollow'} />
      {canonical && <link rel="canonical" href={canonical} />}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:image" content={DEFAULT_IMAGE} />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />

      {graph && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c'),
          }}
        />
      )}
    </Head>
  );
}
