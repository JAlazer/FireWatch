export interface UserCreate {
  name: string;
  email: string;
}

export interface UserResponse {
  user_id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface BiometricsCreate {
  hrv: number;
  resting_heart_rate: number;
  skin_temperature: number;
  respiratory_rate: number;
  spo2: number;
  sleep_hours: number;
}

export interface BiometricsResponse extends BiometricsCreate {
  user_id: string;
  recorded_at: string;
}

export interface LifestyleProfileCreate {
  diet: 'very_unhealthy' | 'unhealthy' | 'moderate' | 'healthy' | 'very_healthy';
  has_autoimmune_condition: boolean;
  smoking_status: 'never' | 'former' | 'current';
  alcohol_consumption: 'none' | 'light' | 'moderate' | 'heavy';
  medications: string[];
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  perceived_stress_level: number;
  works_shift_work: boolean;
  family_history_autoimmune: boolean;
  currently_in_flare: boolean;
}

export interface LifestyleProfileResponse extends LifestyleProfileCreate {
  user_id: string;
}

export interface InflammationResponse {
  user_id: string;
  score: number;
  level: number;
  insight: string;
  computed_at: string;
}
