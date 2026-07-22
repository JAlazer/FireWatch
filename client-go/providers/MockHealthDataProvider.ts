import type { HealthDataProvider } from './HealthDataProvider';
import type {
  HealthDataSnapshot,
  HRVSample,
  RHRSample,
  SleepSession,
  SkinTemperatureSample,
  RespiratoryRateSample,
  SpO2Sample,
} from '@/types/health';
import type { BiometricsCreate } from '@/types/api';

const DAYS = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function randomDelta(magnitude: number): number {
  return (Math.random() * 2 - 1) * magnitude;
}

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function generateTimeSeries(): HealthDataSnapshot {
  const hrv: HRVSample[] = [];
  const rhr: RHRSample[] = [];
  const sleep: SleepSession[] = [];
  const skinTemperature: SkinTemperatureSample[] = [];
  const respiratoryRate: RespiratoryRateSample[] = [];
  const spo2: SpO2Sample[] = [];

  let currentHRV = 55;
  let currentRHR = 62;
  let currentSleep = 7.0;
  let currentSkinTemp = 36.4;
  let currentRespRate = 14.5;
  let currentSpO2 = 97.5;

  for (let i = DAYS - 1; i >= 0; i--) {
    currentHRV = clamp(currentHRV + randomDelta(8), 28, 90);
    currentRHR = clamp(currentRHR + randomDelta(4), 48, 85);
    currentSleep = clamp(currentSleep + randomDelta(1.5), 4.5, 9.5);
    currentSkinTemp = clamp(currentSkinTemp + randomDelta(0.3), 35.5, 37.8);
    currentRespRate = clamp(currentRespRate + randomDelta(1.2), 11, 20);
    currentSpO2 = clamp(currentSpO2 + randomDelta(0.8), 94, 100);

    hrv.push({ timestamp: isoDate(i), sdnn: Math.round(currentHRV * 10) / 10 });
    rhr.push({ timestamp: isoDate(i), bpm: Math.round(currentRHR) });
    sleep.push({ date: dateString(i), durationHours: Math.round(currentSleep * 10) / 10 });
    skinTemperature.push({ timestamp: isoDate(i), celsius: Math.round(currentSkinTemp * 10) / 10 });
    respiratoryRate.push({ timestamp: isoDate(i), breathsPerMinute: Math.round(currentRespRate * 10) / 10 });
    spo2.push({ timestamp: isoDate(i), percentage: Math.round(currentSpO2 * 10) / 10 });
  }

  return { hrv, rhr, sleep, skinTemperature, respiratoryRate, spo2 };
}

export class MockHealthDataProvider implements HealthDataProvider {
  private snapshot: HealthDataSnapshot = generateTimeSeries();

  async getHealthDataSnapshot(): Promise<HealthDataSnapshot> {
    return this.snapshot;
  }

  async getLatestBiometrics(): Promise<BiometricsCreate> {
    const s = this.snapshot;
    return {
      hrv: Math.round(avg(s.hrv.slice(-3).map((x) => x.sdnn)) * 10) / 10,
      resting_heart_rate: s.rhr[s.rhr.length - 1].bpm,
      skin_temperature: s.skinTemperature[s.skinTemperature.length - 1].celsius,
      respiratory_rate: Math.round(avg(s.respiratoryRate.slice(-3).map((x) => x.breathsPerMinute)) * 10) / 10,
      spo2: Math.round(avg(s.spo2.slice(-3).map((x) => x.percentage)) * 10) / 10,
      sleep_hours: Math.round(avg(s.sleep.map((x) => x.durationHours)) * 10) / 10,
    };
  }
}
