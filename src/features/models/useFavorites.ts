import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui';
import { useSession } from '@/features/auth/useSession';

const LOCAL_KEY = 'nx_favorite_models';
const FAVORITES_KEY = ['favorites'] as const;

function readLocal(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* storage unavailable (private mode) */
  }
}

/**
 * Favorite models. Signed-in users persist to the API (optimistic updates);
 * signed-out users keep favorites in localStorage, which are pushed to the
 * account once they sign in.
 */
export function useFavorites() {
  const session = useSession();
  const signedIn = Boolean(session.data?.user);
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<string[]>(readLocal);

  const remote = useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: () => api.get<{ data: string[] }>('/api/favorites').then((r) => r.data),
    enabled: signedIn,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ modelId, favorite }: { modelId: string; favorite: boolean }) =>
      favorite ? api.put(`/api/favorites/${encodeURIComponent(modelId)}`) : api.delete(`/api/favorites/${encodeURIComponent(modelId)}`),
    onMutate: async ({ modelId, favorite }) => {
      await qc.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = qc.getQueryData<string[]>(FAVORITES_KEY);
      qc.setQueryData<string[]>(FAVORITES_KEY, (old = []) => (favorite ? [...new Set([modelId, ...old])] : old.filter((id) => id !== modelId)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(FAVORITES_KEY, ctx?.previous);
      toast.error('Could not update favorites', errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });

  // Push locally stored favorites to the account once after sign-in.
  const syncing = useRef(false);
  useEffect(() => {
    if (!signedIn || !remote.isSuccess || !local.length || syncing.current) return;
    syncing.current = true;
    const pending = local.filter((id) => !remote.data.includes(id));
    void Promise.allSettled(pending.map((id) => api.put(`/api/favorites/${encodeURIComponent(id)}`))).then(() => {
      writeLocal([]);
      setLocal([]);
      syncing.current = false;
      void qc.invalidateQueries({ queryKey: FAVORITES_KEY });
    });
  }, [signedIn, remote.isSuccess, remote.data, local, qc]);

  const ids = useMemo(() => new Set(signedIn ? (remote.data ?? []) : local), [signedIn, remote.data, local]);

  const toggle = useCallback(
    (modelId: string) => {
      const favorite = !ids.has(modelId);
      if (signedIn) {
        mutation.mutate({ modelId, favorite });
        return;
      }
      setLocal((prev) => {
        const next = favorite ? [...new Set([modelId, ...prev])] : prev.filter((id) => id !== modelId);
        writeLocal(next);
        return next;
      });
    },
    [ids, signedIn, mutation],
  );

  return { ids, toggle, signedIn, sessionLoading: session.isLoading };
}
