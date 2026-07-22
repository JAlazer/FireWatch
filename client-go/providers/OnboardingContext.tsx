import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LifestyleProfileCreate } from '@/types/api';
import type { PartialLifestyleProfile } from '@/types/lifestyle';
import { createUser, saveBiometrics, updateLifestyle } from '@/services/api';
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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const userResponse = await createUser({ name: 'FireWatch User', email: 'user@firewatch.app' });
      const userId = userResponse.user_id;

      const biometrics = await provider.getLatestBiometrics();
      await saveBiometrics(userId, biometrics);

      await updateLifestyle(userId, formState as LifestyleProfileCreate);

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
