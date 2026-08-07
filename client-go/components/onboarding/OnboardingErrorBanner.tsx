import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Shows the current submitError (e.g. missing-field validation message
 * from the pre-submit guard in OnboardingContext) at the top of whichever
 * onboarding screen the user lands on. Renders nothing if there's no error.
 */
export function OnboardingErrorBanner() {
  const { submitError } = useOnboarding();

  if (!submitError) return null;

  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{submitError}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    backgroundColor: '#FFF5F4',
    borderWidth: 1,
    borderColor: '#E55A4E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  errorText: { color: '#C0453A', fontSize: 14, lineHeight: 20 },
});
