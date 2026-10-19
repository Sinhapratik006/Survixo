import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, FolderKanban, LogOut, Minus, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  QueryState,
  Select,
  Table,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { SESSION_KEY, useActiveOrg, useCan, useSession, useSwitchOrg } from '@/features/auth/useSession';
import type { OrgRole, Permission } from '@/types/api';

interface OrgCurrent {
  org: { id: string; name: string; slug: string; personal: boolean; promptRetention: string; requestLogRetentionDays: number; createdAt: string };
  role: OrgRole;
  permissions: Permission[];
  members: Array<{ userId: string; email: string; name: string | null; avatarUrl: string | null; role: OrgRole; joinedAt: string }>;
  projects: Array<{ id: string; name: string; environment: Environment; routingPolicy: { id: string; name: string } | null; activeKeys: number; createdAt: string }>;
}
type Environment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
interface AuditRow {
  id: string;
  action: string;
  actor: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
}

const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'];
const ROLE_DESC: Record<OrgRole, string> = {
  OWNER: 'Full control, including deleting the organization and managing owners.',
  ADMIN: 'Manages members, settings, sellers and billing. Cannot delete the org or manage owners.',
  DEVELOPER: 'Builds with the API: keys, routing, projects, playground and webhooks.',
  BILLING: 'Manages credits, budgets and invoices; read-only elsewhere.',
  VIEWER: 'Read-only access to usage, keys, routing and seller data.',
};

/** Mirrors server/src/middleware/org.ts PERMISSIONS. */
const PERMISSION_MATRIX: Array<{ permission: Permission; label: string; roles: OrgRole[] }> = [
  { permission: 'org:manage', label: 'Rename org, data retention settings', roles: ['OWNER', 'ADMIN'] },
  { permission: 'org:delete', label: 'Delete organization', roles: ['OWNER'] },
  { permission: 'members:manage', label: 'Add, remove and change members', roles: ['OWNER', 'ADMIN'] },
  { permission: 'billing:manage', label: 'Add credits, manage billing', roles: ['OWNER', 'ADMIN', 'BILLING'] },
  { permission: 'billing:view', label: 'View balance and invoices', roles: ['OWNER', 'ADMIN', 'BILLING', 'VIEWER'] },
  { permission: 'budget:manage', label: 'Manage budgets', roles: ['OWNER', 'ADMIN', 'BILLING'] },
  { permission: 'keys:manage', label: 'Create and revoke API keys', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
  { permission: 'keys:view', label: 'View API keys', roles: ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'] },
  { permission: 'usage:view', label: 'View usage and request traces', roles: ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'] },
  { permission: 'inference:use', label: 'Run inference in the playground', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
  { permission: 'routing:manage', label: 'Edit routing policies', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
  { permission: 'routing:view', label: 'View routing policies', roles: ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'] },
  { permission: 'seller:manage', label: 'Manage endpoints, offers, payouts', roles: ['OWNER', 'ADMIN'] },
  { permission: 'seller:view', label: 'View seller data', roles: ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'] },
  { permission: 'webhooks:manage', label: 'Manage webhooks and alerts', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
  { permission: 'audit:view', label: 'View the audit log', roles: ['OWNER', 'ADMIN'] },
  { permission: 'projects:manage', label: 'Create and edit projects', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
];

const ENV_TONE: Record<Environment, 'neutral' | 'cyan' | 'brand'> = { DEVELOPMENT: 'neutral', STAGING: 'cyan', PRODUCTION: 'brand' };
const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

function useCurrentOrg() {
  const org = useActiveOrg();
  return useQuery({ queryKey: ['teams', org?.id, 'current'], queryFn: () => api.get<OrgCurrent>('/api/orgs/current'), enabled: Boolean(org) });
}

/** After leaving or deleting an org: refresh memberships, then fall back to the personal workspace. */
function useReturnToPersonal() {
  const qc = useQueryClient();
  const switchOrg = useSwitchOrg();
  return async () => {
    await qc.invalidateQueries({ queryKey: SESSION_KEY });
    const me = qc.getQueryData<{ memberships: Array<{ id: string; personal: boolean }> }>(SESSION_KEY);
    const target = me?.memberships.find((m) => m.personal) ?? me?.memberships[0];
    if (target) switchOrg(target.id);
  };
}

export default function TeamsPage() {
  useEffect(() => {
    document.title = 'Teams · Nexovra';
  }, []);
  const current = useCurrentOrg();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Organizations, members, roles, projects and the audit trail for the active workspace."
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New organization
          </Button>
        }
      />
      {current.isLoading ? (
        <LoadingBlock rows={6} />
      ) : current.error ? (
        <Card>
          <ErrorState error={current.error} onRetry={() => current.refetch()} />
        </Card>
      ) : current.data ? (
        <>
          <OrgCard data={current.data} />
          <MembersCard data={current.data} onCreateOrg={() => setCreating(true)} />
          <ProjectsCard data={current.data} />
          <RolesCard />
          <AuditCard />
          <DangerZone data={current.data} />
        </>
      ) : null}
      {creating && <CreateOrgModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function OrgCard({ data }: { data: OrgCurrent }) {
  const canManage = useCan('org:manage');
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(data.org.name);
  useEffect(() => setName(data.org.name), [data.org.name]);
  const trimmed = name.trim();
  const error = trimmed.length > 0 && trimmed.length < 2 ? 'At least 2 characters' : undefined;

  const rename = useMutation({
    mutationFn: () => api.patch('/api/orgs/current', { name: trimmed }),
    onSuccess: () => {
      toast.success('Organization renamed');
      void qc.invalidateQueries({ queryKey: ['teams', data.org.id] });
      void qc.invalidateQueries({ queryKey: SESSION_KEY });
    },
    onError: (err) => toast.error('Could not rename', errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed.length >= 2 && trimmed !== data.org.name) rename.mutate();
  };

  return (
    <Card>
      <CardHeader title="Current organization" />
      <CardBody className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-200" aria-hidden>
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-slate-900 dark:text-white">{data.org.name}</p>
              {data.org.personal ? <Badge>Personal workspace</Badge> : <Badge tone="brand">Team</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted">{data.org.slug}</p>
            <p className="mt-2 text-sm">
              Your role: <Badge tone="cyan">{roleLabel(data.role)}</Badge>
            </p>
            <p className="mt-1 text-xs text-muted">Created {formatDate(data.org.createdAt)}</p>
          </div>
        </div>
        {canManage ? (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <Field label="Organization name" error={error} className="min-w-[200px] flex-1">
              {(id, aria) => <Input id={id} {...aria} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Button type="submit" variant="outline" loading={rename.isPending} disabled={trimmed.length < 2 || trimmed === data.org.name} className={error ? 'mb-5' : ''}>
              Rename
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Renaming requires the org:manage permission.</p>
        )}
      </CardBody>
    </Card>
  );
}

function CreateOrgModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const switchOrg = useSwitchOrg();
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const create = useMutation({
    mutationFn: () => api.post<{ org: { id: string; name: string } }>('/api/orgs', { name: trimmed }),
    onSuccess: async (res) => {
      // Refresh memberships first so the new org is known before switching to it.
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      switchOrg(res.org.id);
      toast.success(`Created ${res.org.name}`, 'You are now working in the new organization.');
      onClose();
    },
    onError: (err) => toast.error('Could not create organization', errorMessage(err)),
  });
  return (
    <Modal
      open
      onClose={() => !create.isPending && onClose()}
      title="Create organization"
      description="Team organizations have their own balance, API keys, members and seller listings. You become the owner."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="create-org" loading={create.isPending} disabled={trimmed.length < 2}>
            Create & switch
          </Button>
        </>
      }
    >
      <form
        id="create-org"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed.length >= 2) create.mutate();
        }}
      >
        <Field label="Name" hint="2–60 characters. You can rename it later.">
          {(id, aria) => <Input id={id} {...aria} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Acme AI" />}
        </Field>
      </form>
    </Modal>
  );
}

function MembersCard({ data, onCreateOrg }: { data: OrgCurrent; onCreateOrg: () => void }) {
  const canManage = useCan('members:manage');
  const { data: session } = useSession();
  const me = session?.user?.id;
  const isOwner = data.role === 'OWNER';
  const qc = useQueryClient();
  const toast = useToast();
  const returnToPersonal = useReturnToPersonal();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('DEVELOPER');
  const [removing, setRemoving] = useState<OrgCurrent['members'][number] | null>(null);
  const key = ['teams', data.org.id];

  const add = useMutation({
    mutationFn: () => api.post('/api/orgs/current/members', { email: email.trim(), role }),
    onSuccess: () => {
      toast.success('Member added', `${email.trim()} now has the ${roleLabel(role)} role.`);
      setEmail('');
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error('Could not add member', errorMessage(err)),
  });
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: OrgRole }) => api.patch(`/api/orgs/current/members/${v.userId}`, { role: v.role }),
    onSuccess: (_r, v) => {
      toast.success('Role updated');
      void qc.invalidateQueries({ queryKey: key });
      if (v.userId === me) void qc.invalidateQueries({ queryKey: SESSION_KEY });
    },
    onError: (err) => toast.error('Could not change role', errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/orgs/current/members/${userId}`),
    onSuccess: async (_r, userId) => {
      setRemoving(null);
      if (userId === me) {
        toast.success(`You left ${data.org.name}`);
        await returnToPersonal();
      } else {
        toast.success('Member removed');
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => toast.error('Could not remove member', errorMessage(err)),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const leaving = removing?.userId === me;

  return (
    <Card>
      <CardHeader title="Members" description={`${data.members.length} member(s)`} />
      {data.org.personal ? (
        <CardBody>
          <Alert title="Personal workspaces can't have members">
            Create a team organization to collaborate. Your balance, keys and history here stay private to you.{' '}
            <button type="button" onClick={onCreateOrg} className="font-medium underline underline-offset-2">
              Create a team organization
            </button>
          </Alert>
        </CardBody>
      ) : (
        canManage && (
          <CardBody className="border-b border-brand-50 dark:border-navy-700">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (emailValid) add.mutate();
              }}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end"
            >
              <Field label="Email" hint="They must already have a Nexovra account. No invitation email is sent.">
                {(id, aria) => <Input id={id} {...aria} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />}
              </Field>
              <Field label="Role">
                {(id, aria) => (
                  <Select id={id} {...aria} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r} disabled={r === 'OWNER' && !isOwner}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button type="submit" className="sm:mb-5" leftIcon={<UserPlus className="h-4 w-4" />} disabled={!emailValid} loading={add.isPending}>
                Add member
              </Button>
            </form>
          </CardBody>
        )
      )}
      <Table>
        <thead>
          <tr>
            <Th>Member</Th>
            <Th>Role</Th>
            <Th>Joined</Th>
            <Th className="text-right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {data.members.map((m) => {
            const self = m.userId === me;
            const ownerLocked = (m.role === 'OWNER' && !isOwner) || !canManage;
            return (
              <tr key={m.userId}>
                <Td>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {m.name ?? m.email} {self && <Badge className="ml-1">You</Badge>}
                  </p>
                  {m.name && <p className="text-xs text-muted">{m.email}</p>}
                </Td>
                <Td>
                  {canManage && !data.org.personal ? (
                    <>
                      <label htmlFor={`role-${m.userId}`} className="sr-only">
                        Role for {m.email}
                      </label>
                      <Select
                        id={`role-${m.userId}`}
                        value={m.role}
                        disabled={ownerLocked || changeRole.isPending}
                        onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value as OrgRole })}
                        className="h-9 w-40"
                        title={ownerLocked && canManage ? 'Only owners can change owner roles' : undefined}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r} disabled={r === 'OWNER' && !isOwner}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </Select>
                    </>
                  ) : (
                    <Badge tone={m.role === 'OWNER' ? 'brand' : 'neutral'}>{roleLabel(m.role)}</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{formatDate(m.joinedAt)}</Td>
                <Td className="text-right">
                  {!data.org.personal && self && (
                    <Button variant="ghost" size="sm" leftIcon={<LogOut className="h-3.5 w-3.5" />} onClick={() => setRemoving(m)}>
                      Leave
                    </Button>
                  )}
                  {!data.org.personal && !self && canManage && !(m.role === 'OWNER' && !isOwner) && (
                    <Button variant="ghost" size="icon" aria-label={`Remove ${m.email}`} onClick={() => setRemoving(m)} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Modal
        open={Boolean(removing)}
        onClose={() => !remove.isPending && setRemoving(null)}
        title={leaving ? `Leave ${data.org.name}?` : `Remove ${removing?.email ?? ''}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.userId)}>
              {leaving ? 'Leave organization' : 'Remove member'}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {leaving
            ? 'You will lose access to this organization immediately and be switched to your personal workspace. An owner or admin must add you again to regain access. The last owner cannot leave.'
            : 'They lose access to this organization immediately. API keys they created remain active until revoked on the API keys page.'}
        </p>
      </Modal>
    </Card>
  );
}

function ProjectsCard({ data }: { data: OrgCurrent }) {
  const canManage = useCan('projects:manage');
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<OrgCurrent['projects'][number] | 'new' | null>(null);
  const [deleting, setDeleting] = useState<OrgCurrent['projects'][number] | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/orgs/current/projects/${id}`),
    onSuccess: () => {
      toast.success('Project deleted');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['teams', data.org.id] });
    },
    onError: (err) => toast.error('Could not delete project', errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader
        title="Projects"
        description={
          <>
            Group API keys by environment and assign a routing policy. Project budgets live in{' '}
            <Link to="/dashboard/billing#budget" className="font-medium text-brand-700 underline dark:text-brand-300">
              Billing
            </Link>
            ; project keys are created in{' '}
            <Link to="/dashboard/api-keys" className="font-medium text-brand-700 underline dark:text-brand-300">
              API keys
            </Link>
            .
          </>
        }
        actions={
          canManage && (
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New project
            </Button>
          )
        }
      />
      {!data.projects.length ? (
        <EmptyState icon={<FolderKanban className="h-5 w-5" aria-hidden />} title="No projects yet" description="Projects separate keys, budgets and routing for different apps or environments." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Environment</Th>
              <Th>Routing policy</Th>
              <Th>Active keys</Th>
              <Th>Created</Th>
              {canManage && (
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-slate-900 dark:text-white">{p.name}</Td>
                <Td>
                  <Badge tone={ENV_TONE[p.environment]}>{roleLabel(p.environment)}</Badge>
                </Td>
                <Td>{p.routingPolicy?.name ?? <span className="text-muted">Organization default</span>}</Td>
                <Td className="num">{p.activeKeys}</Td>
                <Td className="whitespace-nowrap">{formatDate(p.createdAt)}</Td>
                {canManage && (
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit project ${p.name}`} onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete project ${p.name}`} onClick={() => setDeleting(p)} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <ProjectModal orgId={data.org.id} project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Modal
        open={Boolean(deleting)}
        onClose={() => !del.isPending && setDeleting(null)}
        title={`Delete project "${deleting?.name ?? ''}"?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting.id)}>
              Delete project
            </Button>
          </>
        }
      >
        <p className="text-sm">
          The project and its budgets are removed. {deleting?.activeKeys ? `Its ${deleting.activeKeys} active key(s) are detached from the project. ` : ''}Request history is kept.
        </p>
      </Modal>
    </Card>
  );
}

function ProjectModal({ orgId, project, onClose }: { orgId: string; project: OrgCurrent['projects'][number] | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const canViewRouting = useCan('routing:view');
  const [name, setName] = useState(project?.name ?? '');
  const [environment, setEnvironment] = useState<Environment>(project?.environment ?? 'DEVELOPMENT');
  const [policyId, setPolicyId] = useState(project?.routingPolicy?.id ?? '');
  const policies = useQuery({
    queryKey: ['teams', orgId, 'routing-policies'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string; mode: string; isDefault: boolean }> }>('/api/routing/policies'),
    enabled: canViewRouting,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), environment, routingPolicyId: policyId || null };
      return project ? api.patch(`/api/orgs/current/projects/${project.id}`, body) : api.post('/api/orgs/current/projects', body);
    },
    onSuccess: () => {
      toast.success(project ? 'Project updated' : 'Project created');
      void qc.invalidateQueries({ queryKey: ['teams', orgId] });
      onClose();
    },
    onError: (err) => toast.error(project ? 'Could not update project' : 'Could not create project', errorMessage(err)),
  });
  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={project ? `Edit ${project.name}` : 'New project'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={save.isPending} disabled={!name.trim()}>
            {project ? 'Save' : 'Create project'}
          </Button>
        </>
      }
    >
      <form
        id="project-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <Field label="Name">{(id, aria) => <Input id={id} {...aria} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Support bot" />}</Field>
        <Field label="Environment">
          {(id, aria) => (
            <Select id={id} {...aria} value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
              <option value="DEVELOPMENT">Development</option>
              <option value="STAGING">Staging</option>
              <option value="PRODUCTION">Production</option>
            </Select>
          )}
        </Field>
        <Field label="Routing policy" hint={policies.error ? errorMessage(policies.error) : 'Keys in this project use this policy unless a request overrides it.'}>
          {(id, aria) => (
            <Select id={id} {...aria} value={policyId} onChange={(e) => setPolicyId(e.target.value)} disabled={policies.isLoading}>
              <option value="">Organization default</option>
              {policies.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.mode.replace(/_/g, ' ').toLowerCase()}){p.isDefault ? ' · default' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}

function RolesCard() {
  return (
    <Card>
      <CardHeader title="Roles & permissions" description="What each role can do in an organization. Enforced on the server for every request." />
      <CardBody className="grid gap-3 border-b border-brand-50 sm:grid-cols-2 lg:grid-cols-5 dark:border-navy-700">
        {ROLES.map((r) => (
          <div key={r}>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{roleLabel(r)}</p>
            <p className="mt-0.5 text-xs text-muted">{ROLE_DESC[r]}</p>
          </div>
        ))}
      </CardBody>
      <Table>
        <thead>
          <tr>
            <Th>Permission</Th>
            {ROLES.map((r) => (
              <Th key={r} className="text-center">
                {roleLabel(r)}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MATRIX.map((p) => (
            <tr key={p.permission}>
              <Td>
                <p className="text-sm">{p.label}</p>
                <p className="font-mono text-xs text-muted">{p.permission}</p>
              </Td>
              {ROLES.map((r) => (
                <Td key={r} className="text-center">
                  {p.roles.includes(r) ? (
                    <Check className="mx-auto h-4 w-4 text-brand-600 dark:text-brand-300" aria-label="Allowed" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-slate-300 dark:text-navy-500" aria-label="Not allowed" />
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function AuditCard() {
  const org = useActiveOrg();
  const canView = useCan('audit:view');
  const q = useInfiniteQuery({
    queryKey: ['teams', org?.id, 'audit'],
    queryFn: ({ pageParam }) => api.get<{ data: AuditRow[]; nextCursor: string | null }>('/api/orgs/current/audit', { query: { cursor: pageParam, limit: 50 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(org) && canView,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Card>
      <CardHeader title="Audit log" description="Security-relevant actions in this organization, newest first." />
      {!canView ? (
        <CardBody>
          <p className="text-sm text-muted">Viewing the audit log requires the audit:view permission (Owner or Admin).</p>
        </CardBody>
      ) : (
        <QueryState
          query={{ data: q.data, isLoading: q.isLoading, error: q.error, refetch: q.refetch }}
          isEmpty={() => !rows.length}
          empty={<EmptyState icon={<Users className="h-5 w-5" aria-hidden />} title="No audit events yet" />}
        >
          {() => (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Time</Th>
                    <Th>Action</Th>
                    <Th>Actor</Th>
                    <Th>Target</Th>
                    <Th>IP</Th>
                    <Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <Fragment key={a.id}>
                      <tr>
                        <Td className="whitespace-nowrap">{formatDateTime(a.createdAt)}</Td>
                        <Td>
                          <code className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800 dark:bg-navy-700 dark:text-brand-200">{a.action}</code>
                        </Td>
                        <Td className="max-w-[200px] truncate">{a.actor ?? <span className="text-muted">System / deleted user</span>}</Td>
                        <Td className="max-w-[200px] truncate text-xs">
                          {a.targetType ? (
                            <>
                              {a.targetType} <span className="font-mono text-muted">{a.targetId}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </Td>
                        <Td className="font-mono text-xs">{a.ip ?? '-'}</Td>
                        <Td>
                          {a.metadata && typeof a.metadata === 'object' && Object.keys(a.metadata).length > 0 ? (
                            <details>
                              <summary className="cursor-pointer text-xs font-medium text-brand-700 dark:text-brand-300">Metadata</summary>
                              <pre className="mt-1 max-w-[320px] overflow-x-auto rounded bg-slate-50 p-2 text-[11px] dark:bg-navy-900">{JSON.stringify(a.metadata, null, 2)}</pre>
                            </details>
                          ) : (
                            <span className="text-xs text-muted">-</span>
                          )}
                        </Td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </Table>
              {q.hasNextPage && (
                <div className="flex justify-center p-4">
                  <Button variant="outline" size="sm" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                    Load more
                  </Button>
                </div>
              )}
              {q.isFetchNextPageError && <p role="alert" className="pb-4 text-center text-sm text-red-600">{errorMessage(q.error)}</p>}
            </>
          )}
        </QueryState>
      )}
    </Card>
  );
}

function DangerZone({ data }: { data: OrgCurrent }) {
  const canDelete = useCan('org:delete');
  const toast = useToast();
  const returnToPersonal = useReturnToPersonal();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const del = useMutation({
    mutationFn: () => api.delete('/api/orgs/current', { confirmName: confirm }),
    onSuccess: async () => {
      toast.success(`Deleted ${data.org.name}`);
      setOpen(false);
      await returnToPersonal();
    },
    onError: (err) => toast.error('Could not delete organization', errorMessage(err)),
  });
  if (data.org.personal || !canDelete) return null;
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader title={<span className="text-red-700 dark:text-red-400">Danger zone</span>} />
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl text-sm">
          <p className="font-medium text-slate-900 dark:text-white">Delete this organization</p>
          <p className="mt-0.5 text-muted">Permanently deletes members, projects, API keys, routing policies, seller endpoints and request history. Blocked while any buyer, seller or held balance remains.</p>
        </div>
        <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Delete organization
        </Button>
      </CardBody>
      <Modal
        open={open}
        onClose={() => !del.isPending && setOpen(false)}
        title={`Delete ${data.org.name}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={del.isPending} disabled={confirm !== data.org.name} onClick={() => del.mutate()}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {del.error && <Alert tone="danger">{errorMessage(del.error)}</Alert>}
          <Field label={<>Type <strong>{data.org.name}</strong> to confirm</>}>
            {(id, aria) => <Input id={id} {...aria} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
