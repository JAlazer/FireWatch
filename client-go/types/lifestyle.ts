export type { LifestyleProfileCreate, LifestyleProfileResponse } from './api';

export type PartialLifestyleProfile = Partial<import('./api').LifestyleProfileCreate>;

export interface LifestyleOption<T extends string = string> {
  label: string;
  value: T;
  description?: string;
}
