import React from 'react';
import { Stack } from 'expo-router';
import { OnboardingContextProvider } from '@/providers/OnboardingContext';

export default function OnboardingLayout() {
  return (
    <OnboardingContextProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingContextProvider>
  );
}
