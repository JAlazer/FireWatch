import React from 'react';
import { Stack } from 'expo-router';
import { HealthDataProviderContextProvider } from '@/providers/HealthDataProviderContext';

export default function RootLayout() {
  return (
    <HealthDataProviderContextProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </HealthDataProviderContextProvider>
  );
}
