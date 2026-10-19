import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui';

export interface SavedComparison {
  id: string;
  name: string;
  modelIds: string[];
  createdAt: string;
}

const KEY = ['comparisons'] as const;

export function useSavedComparisons(enabled: boolean) {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ data: SavedComparison[] }>('/api/comparisons').then((r) => r.data),
    enabled,
  });
  const save = useMutation({
    mutationFn: (body: { name: string; modelIds: string[] }) => api.post<{ comparison: SavedComparison }>('/api/comparisons', body),
    onSuccess: (r) => {
      toast.success('Comparison saved', r.comparison.name);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error('Could not save comparison', errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/comparisons/${encodeURIComponent(id)}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<SavedComparison[]>(KEY);
      qc.setQueryData<SavedComparison[]>(KEY, (old = []) => old.filter((c) => c.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      qc.setQueryData(KEY, ctx?.previous);
      toast.error('Could not delete comparison', errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return { list, save, remove };
}
