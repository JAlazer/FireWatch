import type { HealthDataSnapshot } from '@/types/health';
import type { BiometricsCreate } from '@/types/api';

export interface HealthDataProvider {
  getHealthDataSnapshot(): Promise<HealthDataSnapshot>;
  getLatestBiometrics(): Promise<BiometricsCreate>;
}
