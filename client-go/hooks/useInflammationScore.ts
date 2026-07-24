import { useState, useEffect } from 'react';
import { getInflammation } from '@/services/api';
import { USE_MOCK_DATA } from '@/constants/config';
import type { InflammationResponse } from '@/types/api';

const MOCK_INFLAMMATION: InflammationResponse = {
  user_id: 'mock',
  score: 2.4,
  level: 2,
  insight:
    'Your HRV suggests mild systemic stress. Sleep quality is the primary driver — consistent 7+ hour nights typically reduce this score within a week.',
  computed_at: new Date().toISOString(),
};

export interface UseInflammationScoreResult {
  inflammation: InflammationResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInflammationScore(userId: string | null): UseInflammationScoreResult {
  const [inflammation, setInflammation] = useState<InflammationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      if (USE_MOCK_DATA) {
        setInflammation(MOCK_INFLAMMATION);
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    getInflammation(userId)
      .then((data) => {
        if (!cancelled) {
          setInflammation(data);
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
  }, [userId, tick]);

  return { inflammation, loading, error, refetch: () => setTick((t) => t + 1) };
}
