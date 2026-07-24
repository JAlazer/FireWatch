import React, { createContext, useContext, type ReactNode } from 'react';
import type { HealthDataProvider } from './HealthDataProvider';
import { MockHealthDataProvider } from './MockHealthDataProvider';
import { HealthKitProvider } from './HealthKitProvider';
import { USE_MOCK_DATA } from '@/constants/config';

const activeProvider: HealthDataProvider = USE_MOCK_DATA
  ? new MockHealthDataProvider()
  : new HealthKitProvider();

const HealthDataProviderContext = createContext<HealthDataProvider>(activeProvider);

export function HealthDataProviderContextProvider({ children }: { children: ReactNode }) {
  return (
    <HealthDataProviderContext.Provider value={activeProvider}>
      {children}
    </HealthDataProviderContext.Provider>
  );
}

export function useHealthDataProviderContext(): HealthDataProvider {
  return useContext(HealthDataProviderContext);
}
