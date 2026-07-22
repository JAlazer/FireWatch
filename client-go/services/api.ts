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

export const getBiometrics = (userId: string): Promise<BiometricsResponse> =>
  request<BiometricsResponse>(`/users/${userId}/biometrics`);

export const saveBiometrics = (userId: string, data: BiometricsCreate): Promise<BiometricsResponse> =>
  request<BiometricsResponse>(`/users/${userId}/biometrics`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getLifestyle = (userId: string): Promise<LifestyleProfileResponse> =>
  request<LifestyleProfileResponse>(`/users/${userId}/lifestyle`);

export const updateLifestyle = (userId: string, data: LifestyleProfileCreate): Promise<LifestyleProfileResponse> =>
  request<LifestyleProfileResponse>(`/users/${userId}/lifestyle`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const getInflammation = (userId: string): Promise<InflammationResponse> =>
  request<InflammationResponse>(`/users/${userId}/inflammation`);
