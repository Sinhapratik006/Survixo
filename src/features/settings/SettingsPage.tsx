import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader, QueryState, Table, Td, Th, useToast } from '@/components/ui';
import { api, errorMessage, setActiveOrgId } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useTheme } from '@/hooks/useTheme';
import { SESSION_KEY, useActiveOrg, useCan, useSession } from '@/features/auth/useSession';
import { GoogleButton } from '@/features/auth/AuthPages';
import type { SessionUser } from '@/types/api';

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

type Retention = 'NONE' | 'REDACTED_7D' | 'REDACTED_30D';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'security', label: 'Security' },
  { id: 'linked', label: 'Linked accounts' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'privacy', label: 'Data & privacy' },
  { id: 'danger', label: 'Danger zone' },
];

function Section({ id, title, description, children, danger }: { id: string; title: ReactNode; description?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card className={danger ? 'border-red-200 dark:border-red-900' : undefined}>
        <div className="border-b border-brand-50 px-5 py-4 dark:border-navy-700">
          <h2 id={`${id}-title`} className={cn('text-sm font-semibold', danger ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {children}
      </Card>
    </section>
  );
}

export default function SettingsPage() {
  useEffect(() => {
    document.title = 'Settings · Nexovra';
  }, []);
  const session = useSession();
  const user = session.data?.user;

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, security, sessions and the data-retention settings of the active organization." />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-navy-800 dark:hover:text-white">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {session.isLoading ? (
            <LoadingBlock rows={6} />
          ) : session.error ? (
            <Card>
              <ErrorState error={session.error} onRetry={() => session.refetch()} />
            </Card>
          ) : user ? (
            <>
              <ProfileSection user={user} />
              <AppearanceSection />
              <PasswordSection user={user} />
              <LinkedAccountsSection user={user} />
              <SessionsSection />
              <PrivacySection />
              <DeleteAccountSection user={user} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user }: { user: SessionUser }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(user.name ?? '');
  useEffect(() => setName(user.name ?? ''), [user.name]);
  const save = useMutation({
    mutationFn: () => api.patch('/api/settings/profile', { name: name.trim() }),
    onSuccess: () => {
      toast.success('Profile updated');
      void qc.invalidateQueries({ queryKey: SESSION_KEY });
    },
    onError: (err) => toast.error('Could not update profile', errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== user.name) save.mutate();
  };
  return (
    <Section id="profile" title="Profile">
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id, aria) => <Input id={id} {...aria} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
          <Field label={<span className="inline-flex items-center gap-2">Email {user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</span>} hint="Your email cannot be changed here.">
            {(id, aria) => <Input id={id} {...aria} value={user.email} readOnly disabled />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!name.trim() || name.trim() === (user.name ?? '')}>
              Save profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const persist = useMutation({
    mutationFn: (t: 'light' | 'dark' | 'system') => api.patch('/api/settings/profile', { theme: t }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SESSION_KEY }),
    onError: (err) => toast.error('Theme applied on this device, but could not be saved to your account', errorMessage(err)),
  });
  const options = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];
  return (
    <Section id="appearance" title="Appearance" description="Applied immediately on this device and saved to your account.">
      <CardBody>
        <div role="group" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={theme === o.id}
              onClick={() => {
                setTheme(o.id);
                persist.mutate(o.id);
              }}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                theme === o.id
                  ? 'border-cyan-400 bg-cyan-50 text-cyan-900 dark:border-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-100'
                  : 'border-brand-100 text-slate-600 hover:bg-brand-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700',
              )}
            >
              <o.icon className="h-5 w-5" aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
      </CardBody>
    </Section>
  );
}

function passwordSchema(hasPassword: boolean) {
  return z
    .object({
      currentPassword: z.string().max(128),
      newPassword: z.string().min(10, 'At least 10 characters').max(128, 'At most 128 characters'),
      confirm: z.string(),
    })
    .superRefine((v, ctx) => {
      if (hasPassword && !v.currentPassword) ctx.addIssue({ code: 'custom', path: ['currentPassword'], message: 'Enter your current password' });
      if (v.confirm !== v.newPassword) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords do not match' });
    });
}
type PasswordValues = z.infer<ReturnType<typeof passwordSchema>>;

function PasswordSection({ user }: { user: SessionUser }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema(user.hasPassword)), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const errors = form.formState.errors;
  const save = useMutation({
    mutationFn: (v: PasswordValues) =>
      api.post<{ ok: true; otherSessionsRevoked: number }>('/api/settings/password', { ...(user.hasPassword ? { currentPassword: v.currentPassword } : {}), newPassword: v.newPassword }),
    onSuccess: (r) => {
      toast.success(user.hasPassword ? 'Password changed' : 'Password set', `Other sessions signed out: ${r.otherSessionsRevoked}`);
      form.reset();
      void qc.invalidateQueries({ queryKey: SESSION_KEY });
      void qc.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    },
    onError: (err) => toast.error('Could not update password', errorMessage(err)),
  });
  return (
    <Section
      id="security"
      title={user.hasPassword ? 'Change password' : 'Set a password'}
      description={user.hasPassword ? 'Changing your password signs out all your other sessions.' : 'You sign in with Google only. Set a password to also sign in with email, and to be able to unlink Google.'}
    >
      <CardBody>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid max-w-xl gap-4" noValidate>
          {user.hasPassword && (
            <Field label="Current password" error={errors.currentPassword?.message}>
              {(id, aria) => <Input id={id} {...aria} type="password" autoComplete="current-password" {...form.register('currentPassword')} />}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" error={errors.newPassword?.message} hint="At least 10 characters.">
              {(id, aria) => <Input id={id} {...aria} type="password" autoComplete="new-password" {...form.register('newPassword')} />}
            </Field>
            <Field label="Confirm new password" error={errors.confirm?.message}>
              {(id, aria) => <Input id={id} {...aria} type="password" autoComplete="new-password" {...form.register('confirm')} />}
            </Field>
          </div>
          <div>
            <Button type="submit" loading={save.isPending}>
              {user.hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Section>
  );
}

function LinkedAccountsSection({ user }: { user: SessionUser }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const google = user.linkedAccounts.find((a) => a.provider === 'google');
  const unlink = useMutation({
    mutationFn: () => api.delete('/api/settings/oauth/google'),
    onSuccess: () => {
      toast.success('Google account unlinked');
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: SESSION_KEY });
    },
    onError: (err) => toast.error('Could not unlink Google', errorMessage(err)),
  });
  return (
    <Section id="linked" title="Linked accounts" description="Sign in with a linked provider instead of your password.">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand-100 p-4 dark:border-navy-600">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
              Google {google ? <Badge tone="success">Linked</Badge> : <Badge>Not linked</Badge>}
            </p>
            {google ? (
              <p className="mt-0.5 text-sm text-muted">
                {google.email ?? 'Google account'} · linked {formatRelative(google.createdAt)}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted">Link your Google account to sign in with one click.</p>
            )}
          </div>
          {google ? (
            <div className="text-right">
              <Button variant="outline" size="sm" disabled={!user.hasPassword} onClick={() => setConfirm(true)}>
                Unlink
              </Button>
              {!user.hasPassword && <p className="mt-1 max-w-[240px] text-xs text-muted">Set a password first; otherwise you could not sign in after unlinking.</p>}
            </div>
          ) : (
            <div className="w-full sm:w-64">
              <GoogleButton mode="link" redirect="/dashboard/settings" label="Link Google account" />
            </div>
          )}
        </div>
      </CardBody>
      <Modal
        open={confirm}
        onClose={() => !unlink.isPending && setConfirm(false)}
        title="Unlink Google?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={unlink.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={unlink.isPending} onClick={() => unlink.mutate()}>
              Unlink
            </Button>
          </>
        }
      >
        <p className="text-sm">You will no longer be able to sign in with Google. You can still sign in with {user.email} and your password, and link Google again later.</p>
      </Modal>
    </Section>
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : null;
  return browser || os ? [browser, os].filter(Boolean).join(' on ') : ua.slice(0, 60);
}

function SessionsSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const [revokingOthers, setRevokingOthers] = useState(false);
  const q = useQuery({ queryKey: ['settings', 'sessions'], queryFn: () => api.get<{ data: SessionRow[] }>('/api/settings/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/sessions/${id}`),
    onSuccess: () => {
      toast.success('Session revoked');
      void qc.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    },
    onError: (err) => toast.error('Could not revoke session', errorMessage(err)),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ ok: true; revoked: number }>('/api/settings/sessions/revoke-others'),
    onSuccess: (r) => {
      toast.success('Other sessions signed out', `${r.revoked} session(s) revoked.`);
      setRevokingOthers(false);
      void qc.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    },
    onError: (err) => toast.error('Could not revoke sessions', errorMessage(err)),
  });
  const others = q.data?.data.filter((s) => !s.current).length ?? 0;

  return (
    <Section id="sessions" title="Sessions" description="Devices currently signed in to your account.">
      <div className="flex justify-end border-b border-brand-50 px-5 py-3 dark:border-navy-700">
        <Button variant="outline" size="sm" leftIcon={<LogOut className="h-3.5 w-3.5" />} disabled={!others} onClick={() => setRevokingOthers(true)}>
          Sign out all other sessions
        </Button>
      </div>
      <QueryState query={q} isEmpty={(d) => !d.data.length} empty={<EmptyState title="No active sessions" />}>
        {(d) => (
          <Table>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>IP address</Th>
                <Th>Signed in</Th>
                <Th>Last seen</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {d.data.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                      <Laptop className="h-4 w-4 text-muted" aria-hidden />
                      {describeAgent(s.userAgent)}
                      {s.current && <Badge tone="cyan">This device</Badge>}
                    </p>
                    {s.userAgent && (
                      <p className="mt-0.5 max-w-[320px] truncate text-xs text-muted" title={s.userAgent}>
                        {s.userAgent}
                      </p>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{s.ip ?? '-'}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(s.createdAt)}</Td>
                  <Td className="whitespace-nowrap" title={formatDateTime(s.lastSeenAt)}>
                    {formatRelative(s.lastSeenAt)}
                  </Td>
                  <Td className="text-right">
                    {s.current ? (
                      <span className="text-xs text-muted">Use Sign out</span>
                    ) : (
                      <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === s.id} disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                        Revoke
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryState>
      <Modal
        open={revokingOthers}
        onClose={() => !revokeOthers.isPending && setRevokingOthers(false)}
        title="Sign out all other sessions?"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokingOthers(false)} disabled={revokeOthers.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
              Sign out {others} session{others === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <p className="text-sm">Every device except this one will be signed out immediately. API keys are not affected.</p>
      </Modal>
    </Section>
  );
}

const RETENTION_OPTIONS: Array<{ id: Retention; label: string; detail: string }> = [
  { id: 'NONE', label: 'Do not store prompts (default)', detail: 'Only metadata (tokens, cost, latency, routing) is recorded. Prompts and outputs are never written to the database.' },
  { id: 'REDACTED_7D', label: 'Store redacted prompts for 7 days', detail: 'Request messages are stored after secret redaction (API keys, tokens, passwords) to help debug traces, then deleted automatically.' },
  { id: 'REDACTED_30D', label: 'Store redacted prompts for 30 days', detail: 'Same as above with a 30-day retention window.' },
];

function PrivacySection() {
  const org = useActiveOrg();
  const canManage = useCan('org:manage');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['teams', org?.id, 'current'],
    queryFn: () => api.get<{ org: { id: string; name: string; promptRetention: Retention; requestLogRetentionDays: number } }>('/api/orgs/current'),
    enabled: Boolean(org),
  });
  const [retention, setRetention] = useState<Retention>('NONE');
  const [days, setDays] = useState('90');
  useEffect(() => {
    if (q.data) {
      setRetention(q.data.org.promptRetention);
      setDays(String(q.data.org.requestLogRetentionDays));
    }
  }, [q.data]);

  const daysN = Number(days);
  const daysError = !Number.isInteger(daysN) || daysN < 7 || daysN > 365 ? 'Whole number of days between 7 and 365' : undefined;
  const changed = q.data ? retention !== q.data.org.promptRetention || daysN !== q.data.org.requestLogRetentionDays : false;
  const purging = q.data ? q.data.org.promptRetention !== 'NONE' && retention === 'NONE' : false;

  const save = useMutation({
    mutationFn: () => api.put('/api/orgs/current/retention', { promptRetention: retention, requestLogRetentionDays: daysN }),
    onSuccess: () => {
      toast.success('Data retention updated', purging ? 'Stored prompts were purged.' : undefined);
      void qc.invalidateQueries({ queryKey: ['teams', org?.id] });
    },
    onError: (err) => toast.error('Could not update retention', errorMessage(err)),
  });

  return (
    <Section id="privacy" title="Data & privacy" description={org ? `Organization-level settings for ${org.name}.` : 'Organization-level settings.'}>
      <CardBody>
        {q.isLoading ? (
          <LoadingBlock rows={3} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canManage && changed && !daysError) save.mutate();
            }}
            className="space-y-5"
          >
            {!canManage && <Alert>Only owners and admins (org:manage) can change these settings.</Alert>}
            <fieldset disabled={!canManage}>
              <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Prompt retention</legend>
              <div className="space-y-2">
                {RETENTION_OPTIONS.map((o) => (
                  <label
                    key={o.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-400',
                      retention === o.id ? 'border-cyan-400 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-950/30' : 'border-brand-100 dark:border-navy-600',
                      !canManage && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <input type="radio" name="retention" value={o.id} checked={retention === o.id} onChange={() => setRetention(o.id)} className="mt-1 accent-brand-600" />
                    <span>
                      <span className="block text-sm font-medium text-slate-900 dark:text-white">{o.label}</span>
                      <span className="block text-xs text-muted">{o.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {purging && <Alert tone="warning">Turning prompt retention off immediately purges all prompts currently stored for this organization.</Alert>}
            <Field label="Request log retention (days)" error={daysError} hint="How long request metadata (traces, tokens, costs) is kept. 7–365 days." className="max-w-xs">
              {(id, aria) => <Input id={id} {...aria} type="number" min={7} max={365} value={days} onChange={(e) => setDays(e.target.value)} disabled={!canManage} className="num" />}
            </Field>
            {canManage && (
              <Button type="submit" loading={save.isPending} disabled={!changed || Boolean(daysError)}>
                Save retention settings
              </Button>
            )}
          </form>
        )}
      </CardBody>
    </Section>
  );
}

function DeleteAccountSection({ user }: { user: SessionUser }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const matches = confirm.trim().toLowerCase() === user.email.toLowerCase();
  const del = useMutation({
    mutationFn: () => api.delete('/api/settings/account', { confirmEmail: confirm.trim() }),
    onSuccess: () => {
      setActiveOrgId(null);
      qc.clear();
      toast.success('Your account was deleted');
      navigate('/', { replace: true });
    },
    onError: (err) => toast.error('Could not delete account', errorMessage(err)),
  });
  return (
    <Section id="danger" title="Danger zone" danger>
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl text-sm">
          <p className="font-medium text-slate-900 dark:text-white">Delete your account</p>
          <p className="mt-0.5 text-muted">
            Permanently deletes your user, sessions, linked accounts, favorites and your personal workspace including its request history and any remaining buyer credit. You are removed from team organizations.
          </p>
        </div>
        <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardBody>
      <Modal
        open={open}
        onClose={() => !del.isPending && setOpen(false)}
        title="Delete your account?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={del.isPending} disabled={!matches} onClick={() => del.mutate()}>
              Delete account permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Deletion is blocked while:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>you are the only owner of a team organization that has other members (transfer ownership first);</li>
            <li>your personal workspace holds seller earnings, in-flight requests or pending payouts.</li>
          </ul>
          {del.error && <Alert tone="danger">{errorMessage(del.error)}</Alert>}
          <Field label={<>Type <strong>{user.email}</strong> to confirm</>}>
            {(id, aria) => <Input id={id} {...aria} type="email" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Modal>
    </Section>
  );
}
