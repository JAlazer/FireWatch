import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingErrorBanner } from '@/components/onboarding/OnboardingErrorBanner';

function formatBool(v?: boolean): string {
  if (v === undefined) return '—';
  return v ? 'Yes' : 'No';
}

function formatList(arr?: string[]): string {
  if (!arr || arr.length === 0) return 'None';
  return arr.join(', ');
}

function formatEnum(v?: string): string {
  if (!v) return '—';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SurveyCompleteScreen() {
  const { formState, submit, submitting, submitError } = useOnboarding();

  const summaryItems: { label: string; value: string }[] = [
    { label: 'Autoimmune condition', value: formatBool(formState.has_autoimmune_condition) },
    { label: 'Family history', value: formatBool(formState.family_history_autoimmune) },
    { label: 'Currently in flare', value: formatBool(formState.currently_in_flare) },
    { label: 'Diet', value: formatEnum(formState.diet) },
    { label: 'Smoking', value: formatEnum(formState.smoking_status) },
    { label: 'Alcohol', value: formatEnum(formState.alcohol_consumption) },
    { label: 'Medications', value: formatList(formState.medications) },
    { label: 'Activity level', value: formatEnum(formState.activity_level) },
    { label: 'Stress level', value: formState.perceived_stress_level?.toString() ?? '—' },
    { label: 'Shift work', value: formatBool(formState.works_shift_work) },
  ];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Review your answers</Text>
      <Text style={styles.subheading}>
        You can update these anytime in settings.
      </Text>

      <View style={styles.summaryCard}>
        {summaryItems.map((item) => (
          <View key={item.label} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{item.label}</Text>
            <Text style={styles.summaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      {submitError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitButtonText}>Get my inflammation score →</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 48 },
  heading: { fontSize: 26, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  subheading: { fontSize: 15, color: '#666', marginBottom: 28, lineHeight: 22 },
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  summaryLabel: { fontSize: 14, color: '#666', flex: 1 },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', flex: 1, textAlign: 'right' },
  errorBox: {
    backgroundColor: '#FFF5F4',
    borderWidth: 1,
    borderColor: '#E55A4E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: '#C0453A', fontSize: 14, lineHeight: 20 },
  submitButton: {
    backgroundColor: '#E55A4E',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
