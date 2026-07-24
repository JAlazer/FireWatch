import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LifestyleProfileCreate } from '@/types/api';
import type { PartialLifestyleProfile } from '@/types/lifestyle';
import { createUser, saveBiometrics, createLifestyle } from '@/services/api';
import { useHealthDataProviderContext } from './HealthDataProviderContext';
import { STORAGE_KEY_USER_ID } from '@/constants/config';

interface OnboardingContextValue {
  formState: PartialLifestyleProfile;
  setField: <K extends keyof LifestyleProfileCreate>(key: K, value: LifestyleProfileCreate[K]) => void;
  submit: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// Every field LifestyleProfileCreate requires, paired with a friendly label
// and the onboarding screen where it's collected. Used to validate formState
// before submission and to route the user back to whatever they missed.
const REQUIRED_LIFESTYLE_FIELDS: {
  key: keyof LifestyleProfileCreate;
  label: string;
  step: string;
}[] = [
  { key: 'has_autoimmune_condition', label: 'Autoimmune condition', step: '/onboarding/autoimmune-status' },
  { key: 'family_history_autoimmune', label: 'Family history', step: '/onboarding/autoimmune-status' },
  { key: 'currently_in_flare', label: 'Current flare status', step: '/onboarding/autoimmune-status' },
  { key: 'diet', label: 'Diet', step: '/onboarding/lifestyle' },
  { key: 'smoking_status', label: 'Smoking history', step: '/onboarding/lifestyle' },
  { key: 'alcohol_consumption', label: 'Alcohol consumption', step: '/onboarding/lifestyle' },
  { key: 'medications', label: 'Medications', step: '/onboarding/lifestyle' },
  { key: 'activity_level', label: 'Activity level', step: '/onboarding/activity' },
  { key: 'perceived_stress_level', label: 'Stress level', step: '/onboarding/activity' },
  { key: 'works_shift_work', label: 'Shift work', step: '/onboarding/activity' },
];

function getMissingFields(formState: PartialLifestyleProfile) {
  return REQUIRED_LIFESTYLE_FIELDS.filter(({ key }) => {
    const value = formState[key];
    return value === undefined || value === null;
  });
}

export function OnboardingContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const provider = useHealthDataProviderContext();
  const [formState, setFormState] = useState<PartialLifestyleProfile>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function setField<K extends keyof LifestyleProfileCreate>(key: K, value: LifestyleProfileCreate[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setSubmitError(null);

    const missing = getMissingFields(formState);
    if (missing.length > 0) {
      const labels = missing.map((f) => f.label).join(', ');
      setSubmitError(`Please complete: ${labels}`);
      router.push(missing[0].step as never);
      return;
    }

    setSubmitting(true);
    try {
      const userResponse = await createUser({ name: 'FireWatch User', email: 'user@firewatch.app' });
      const userId = userResponse.user_id;

      const biometrics = await provider.getLatestBiometrics();
      await saveBiometrics(userId, biometrics);

      await createLifestyle(userId, formState as LifestyleProfileCreate);

      await AsyncStorage.setItem(STORAGE_KEY_USER_ID, userId);
      router.replace('/(tabs)/dashboard');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed. Is the server running?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingContext.Provider value={{ formState, setField, submit, submitting, submitError }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingContext(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboardingContext must be used inside OnboardingContextProvider');
  return ctx;
}