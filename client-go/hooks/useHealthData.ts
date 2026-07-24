import { useState, useEffect } from 'react';
import { useHealthDataProviderContext } from '@/providers/HealthDataProviderContext';
import type { HealthDataSnapshot } from '@/types/health';

export interface UseHealthDataResult {
  snapshot: HealthDataSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHealthData(): UseHealthDataResult {
  const provider = useHealthDataProviderContext();
  const [snapshot, setSnapshot] = useState<HealthDataSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    provider
      .getHealthDataSnapshot()
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, tick]);

  return { snapshot, loading, error, refetch: () => setTick((t) => t + 1) };
}
