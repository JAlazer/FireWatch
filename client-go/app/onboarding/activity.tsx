import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/hooks/useOnboarding';
import { LifestyleQuestion } from '@/components/onboarding/LifestyleQuestion';
import type { LifestyleOption } from '@/types/lifestyle';
import type { LifestyleProfileCreate } from '@/types/api';

const ACTIVITY_OPTIONS: LifestyleOption<LifestyleProfileCreate['activity_level']>[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little to no exercise' },
  { value: 'light', label: 'Light', description: 'Light exercise 1–3 days/week' },
  { value: 'moderate', label: 'Moderate', description: 'Moderate exercise 3–5 days/week' },
  { value: 'active', label: 'Active', description: 'Hard exercise 6–7 days/week' },
  { value: 'very_active', label: 'Very Active', description: 'Hard daily exercise or physical job' },
];

const STRESS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function ActivityScreen() {
  const router = useRouter();
  const { formState, setField } = useOnboarding();
  const stressLevel = formState.perceived_stress_level ?? null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 3 of 3</Text>
      <Text style={styles.heading}>Activity & stress</Text>
      <Text style={styles.subheading}>
        Exercise and stress both significantly affect inflammation.
      </Text>

      <LifestyleQuestion
        question="Activity level"
        variant="choice"
        options={ACTIVITY_OPTIONS}
        value={formState.activity_level ?? null}
        onChange={(v) => setField('activity_level', v as LifestyleProfileCreate['activity_level'])}
      />

      <View style={styles.stressSection}>
        <Text style={styles.stressQuestion}>Perceived stress level</Text>
        <Text style={styles.stressSubtitle}>1 = very low · 10 = extremely high</Text>
        <View style={styles.stressRow}>
          {STRESS_LEVELS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.stressBox, stressLevel === n && styles.stressBoxSelected]}
              onPress={() => setField('perceived_stress_level', n)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stressLabel, stressLevel === n && styles.stressLabelSelected]}>
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <LifestyleQuestion
        question="Do you do shift work?"
        subtitle="Night shifts, rotating schedules, or irregular hours"
        variant="boolean"
        value={formState.works_shift_work ?? null}
        onChange={(v) => setField('works_shift_work', v)}
      />

      <TouchableOpacity
        style={styles.nextButton}
        onPress={() => router.push('/onboarding/survey-complete')}
        activeOpacity={0.8}
      >
        <Text style={styles.nextButtonText}>Review →</Text>
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
  stressSection: { marginBottom: 24 },
  stressQuestion: { fontSize: 17, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  stressSubtitle: { fontSize: 14, color: '#666', marginBottom: 12 },
  stressRow: { flexDirection: 'row', gap: 6 },
  stressBox: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DDD',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stressBoxSelected: {
    backgroundColor: '#E55A4E',
    borderColor: '#E55A4E',
  },
  stressLabel: { fontSize: 14, fontWeight: '600', color: '#555' },
  stressLabelSelected: { color: '#FFF' },
  nextButton: {
    backgroundColor: '#E55A4E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  nextButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
