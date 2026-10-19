import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage, SignupPage } from '@/features/auth/AuthPages';
import { LoadingBlock } from '@/components/ui';
import { RouteError } from './RouteError';

const page = (factory: () => Promise<{ default: ComponentType }>) => {
  const C: LazyExoticComponent<ComponentType> = lazy(factory);
  return (
    <Suspense fallback={<LoadingBlock rows={4} className="container-page py-10" />}>
      <C />
    </Suspense>
  );
};

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: page(() => import('@/features/home/HomePage')) },
          { path: '/models', element: page(() => import('@/features/models/ModelsPage')) },
          { path: '/models/:id', element: page(() => import('@/features/models/ModelDetailPage')) },
          { path: '/calculator', element: page(() => import('@/features/calculator/CalculatorPage')) },
          { path: '/docs', element: page(() => import('@/features/docs/DocsPage')) },
          { path: '/docs/quickstart', element: page(() => import('@/features/docs/QuickstartPage')) },
          { path: '/analytics', element: page(() => import('@/features/analytics/AnalyticsPage')) },
          { path: '/community', element: page(() => import('@/features/community/CommunityPage')) },
          { path: '/pricing', element: page(() => import('@/features/pricing/PricingPage')) },
          { path: '/status', element: page(() => import('@/features/status/StatusPage')) },
          { path: '/support', element: page(() => import('@/features/legal/SupportPage')) },
          { path: '/legal/privacy', element: page(() => import('@/features/legal/PrivacyPage')) },
          { path: '/legal/terms', element: page(() => import('@/features/legal/TermsPage')) },
          { path: '*', element: page(() => import('./NotFoundPage')) },
        ],
      },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/dashboard',
            element: <DashboardLayout />,
            children: [
              { index: true, element: page(() => import('@/features/dashboard/DashboardPage')) },
              { path: 'api-keys', element: page(() => import('@/features/api-keys/ApiKeysPage')) },
              { path: 'usage', element: page(() => import('@/features/usage/UsagePage')) },
              { path: 'billing', element: page(() => import('@/features/billing/BillingPage')) },
              { path: 'routing', element: page(() => import('@/features/routing/RoutingPage')) },
              { path: 'playground', element: page(() => import('@/features/playground/PlaygroundPage')) },
              { path: 'sellers', element: page(() => import('@/features/sellers/SellerOverviewPage')) },
              { path: 'sellers/offers', element: page(() => import('@/features/sellers/OffersPage')) },
              { path: 'teams', element: page(() => import('@/features/teams/TeamsPage')) },
              { path: 'settings', element: page(() => import('@/features/settings/SettingsPage')) },
              { path: 'alerts', element: page(() => import('@/features/alerts/AlertsPage')) },
              { path: '*', element: page(() => import('./NotFoundPage')) },
            ],
          },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
