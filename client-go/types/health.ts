export interface HRVSample {
  timestamp: string;
  sdnn: number;
}

export interface RHRSample {
  timestamp: string;
  bpm: number;
}

export interface SleepSession {
  date: string;
  durationHours: number;
}

export interface SkinTemperatureSample {
  timestamp: string;
  celsius: number;
}

export interface RespiratoryRateSample {
  timestamp: string;
  breathsPerMinute: number;
}

export interface SpO2Sample {
  timestamp: string;
  percentage: number;
}

export interface HealthDataSnapshot {
  hrv: HRVSample[];
  rhr: RHRSample[];
  sleep: SleepSession[];
  skinTemperature: SkinTemperatureSample[];
  respiratoryRate: RespiratoryRateSample[];
  spo2: SpO2Sample[];
}
