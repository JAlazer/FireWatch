import { API_BASE_URL } from '@/constants/config';
import type {
  UserCreate,
  UserResponse,
  BiometricsCreate,
  BiometricsResponse,
  LifestyleProfileCreate,
  LifestyleProfileResponse,
  InflammationResponse,
} from '@/types/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export const createUser = (data: UserCreate): Promise<UserResponse> =>
  request<UserResponse>('/users', { method: 'POST', body: JSON.stringify(data) });

export const getUser = (userId: string): Promise<UserResponse> =>
  request<UserResponse>(`/users/${userId}`);

// DORMANT (biometrics). No live caller: onboarding no longer POSTs biometrics, and
// the tabs read biometrics on-device via buildProvider (a sample stream), not this
// 6-field snapshot. The 6-field BiometricsCreate is SUPERSEDED by the narrow
// BIOMETRICS schema (metric_type, healthkit_sample_uuid, start_at/end_at) — the
// FastAPI code lagging the DB design, not us overriding it. Kept for when the server
// can hold a real time series.
export const getBiometrics = (userId: string): Promise<BiometricsResponse> =>
  request<BiometricsResponse>(`/users/${userId}/biometrics`);

export const saveBiometrics = (userId: string, data: BiometricsCreate): Promise<BiometricsResponse> =>
  request<BiometricsResponse>(`/users/${userId}/biometrics`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getLifestyle = (userId: string): Promise<LifestyleProfileResponse> =>
  request<LifestyleProfileResponse>(`/users/${userId}/lifestyle`);

export const createLifestyle = (userId: string, data: LifestyleProfileCreate): Promise<LifestyleProfileResponse> =>
  request<LifestyleProfileResponse>(`/users/${userId}/lifestyle`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateLifestyle = (userId: string, data: LifestyleProfileCreate): Promise<LifestyleProfileResponse> =>
  request<LifestyleProfileResponse>(`/users/${userId}/lifestyle`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

// DORMANT (inflammation). No live caller: scoring runs on-device (src/mock/score.ts)
// off the sample stream, which the server's 6-field snapshot can't support. Moves to
// a Service call when the server holds a time series; the scoring logic is identical.
export const getInflammation = (userId: string): Promise<InflammationResponse> =>
  request<InflammationResponse>(`/users/${userId}/inflammation`);