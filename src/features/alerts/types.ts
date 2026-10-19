export interface NotificationItem {
  id: string;
  orgId: string;
  type: string;
  severity: 'info' | 'warning' | 'critical' | string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  payload: unknown;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  attempts: number;
  nextAttemptAt: string;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export const EVENT_DESCRIPTIONS: Record<string, string> = {
  'budget.threshold': 'A daily or monthly budget alert threshold was crossed.',
  'offer.failed': 'One of your seller offers failed a live request and was marked unhealthy.',
  'provider.down': 'A provider or offer you rely on became unavailable.',
  'usage.unusual': 'Unusual spend or request volume was detected.',
  'key.revoked': 'An API key was revoked, manually or by rotation.',
  'payout.updated': 'A seller payout changed status.',
  'test.ping': 'Test event sent from this dashboard.',
};
