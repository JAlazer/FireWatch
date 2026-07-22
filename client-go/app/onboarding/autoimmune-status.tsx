import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/hooks/useOnboarding';
import { LifestyleQuestion } from '@/components/onboarding/LifestyleQuestion';

export default function AutoimmuneStatusScreen() {
  const router = useRouter();
  const { formState, setField } = useOnboarding();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 1 of 3</Text>
      <Text style={styles.heading}>Your health history</Text>
      <Text style={styles.subheading}>
        This helps us personalize your inflammation baseline.
      </Text>

      <LifestyleQuestion
        question="Do you have an autoimmune condition?"
        subtitle="e.g. rheumatoid arthritis, lupus, IBD, MS, psoriasis"
        variant="boolean"
        value={formState.has_autoimmune_condition ?? null}
        onChange={(v) => setField('has_autoimmune_condition', v)}
      />

      <LifestyleQuestion
        question="Does anyone in your immediate family have an autoimmune condition?"
        variant="boolean"
        value={formState.family_history_autoimmune ?? null}
        onChange={(v) => setField('family_history_autoimmune', v)}
      />

      <LifestyleQuestion
        question="Are you currently experiencing a flare?"
        variant="boolean"
        value={formState.currently_in_flare ?? null}
        onChange={(v) => setField('currently_in_flare', v)}
      />

      <TouchableOpacity
        style={styles.nextButton}
        onPress={() => router.push('/onboarding/lifestyle')}
        activeOpacity={0.8}
      >
        <Text style={styles.nextButtonText}>Next →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 48 },
  step: { fontSize: 13, color: '#E55A4E', fontWeight: '600', marginBottom: 8 },
  heading: { fontSize: 26, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  subheading: { fontSize: 15, color: '#666', marginBottom: 32, lineHeight: 22 },
  nextButton: {
    backgroundColor: '#E55A4E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  nextButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
