import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, getActiveOrgId, setActiveOrgId } from '@/lib/api';
import type { Membership, MeResponse, Permission } from '@/types/api';

export const SESSION_KEY = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    staleTime: 60_000,
  });
}

/** The active organization: the stored choice if still a member, otherwise the personal workspace. */
export function useActiveOrg(): Membership | null {
  const { data } = useSession();
  if (!data?.user || !data.memberships.length) return null;
  const stored = getActiveOrgId();
  const found = data.memberships.find((m) => m.id === stored);
  const org = found ?? data.memberships[0]!;
  if (org.id !== stored) setActiveOrgId(org.id);
  return org;
}

export function useCan(permission: Permission): boolean {
  const org = useActiveOrg();
  return Boolean(org?.permissions.includes(permission));
}

export function useSwitchOrg() {
  const qc = useQueryClient();
  return (orgId: string) => {
    setActiveOrgId(orgId);
    // Every org-scoped query is refetched for the new workspace.
    qc.invalidateQueries();
  };
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      setActiveOrgId(null);
      qc.clear();
      navigate('/login');
    },
  });
}
