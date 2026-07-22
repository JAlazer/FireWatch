import type { HealthDataProvider } from './HealthDataProvider';
import type { HealthDataSnapshot } from '@/types/health';
import type { BiometricsCreate } from '@/types/api';

export class HealthKitProvider implements HealthDataProvider {
  async getHealthDataSnapshot(): Promise<HealthDataSnapshot> {
    throw new Error('HealthKitProvider not implemented');
  }

  async getLatestBiometrics(): Promise<BiometricsCreate> {
    throw new Error('HealthKitProvider not implemented');
  }
}
