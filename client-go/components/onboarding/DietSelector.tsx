import React from 'react';
import { LifestyleQuestion } from './LifestyleQuestion';
import type { LifestyleProfileCreate } from '@/types/api';
import type { LifestyleOption } from '@/types/lifestyle';

const DIET_OPTIONS: LifestyleOption<LifestyleProfileCreate['diet']>[] = [
  { value: 'very_unhealthy', label: 'Very Unhealthy', description: 'Fast food, processed foods daily' },
  { value: 'unhealthy', label: 'Unhealthy', description: 'Mostly processed, few vegetables' },
  { value: 'moderate', label: 'Moderate', description: 'Mix of whole and processed foods' },
  { value: 'healthy', label: 'Healthy', description: 'Mostly whole foods, vegetables' },
  { value: 'very_healthy', label: 'Very Healthy', description: 'Whole foods, minimal processing' },
];

interface DietSelectorProps {
  value: LifestyleProfileCreate['diet'] | null;
  onChange: (value: LifestyleProfileCreate['diet']) => void;
}

export function DietSelector({ value, onChange }: DietSelectorProps) {
  return (
    <LifestyleQuestion
      question="How would you describe your diet?"
      variant="choice"
      options={DIET_OPTIONS}
      value={value}
      onChange={onChange as (v: string) => void}
    />
  );
}
