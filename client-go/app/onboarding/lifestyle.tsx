import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/hooks/useOnboarding';
import { DietSelector } from '@/components/onboarding/DietSelector';
import { LifestyleQuestion } from '@/components/onboarding/LifestyleQuestion';
import type { LifestyleOption } from '@/types/lifestyle';
import type { LifestyleProfileCreate } from '@/types/api';
import { OnboardingErrorBanner } from '@/components/onboarding/OnboardingErrorBanner';

const SMOKING_OPTIONS: LifestyleOption<LifestyleProfileCreate['smoking_status']>[] = [
  { value: 'never', label: 'Never smoked' },
  { value: 'former', label: 'Former smoker' },
  { value: 'current', label: 'Current smoker' },
];

const ALCOHOL_OPTIONS: LifestyleOption<LifestyleProfileCreate['alcohol_consumption']>[] = [
  { value: 'none', label: 'None', description: "I don't drink" },
  { value: 'light', label: 'Light', description: '1–3 drinks per week' },
  { value: 'moderate', label: 'Moderate', description: '4–7 drinks per week' },
  { value: 'heavy', label: 'Heavy', description: '8+ drinks per week' },
];

export default function LifestyleScreen() {
  const router = useRouter();
  const { formState, setField } = useOnboarding();
  const [medInput, setMedInput] = useState('');

  function addMedication() {
    const trimmed = medInput.trim();
    if (!trimmed) return;
    const current = formState.medications ?? [];
    setField('medications', [...current, trimmed]);
    setMedInput('');
  }

  function removeMedication(index: number) {
    const current = formState.medications ?? [];
    setField('medications', current.filter((_, i) => i !== index));
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 2 of 3</Text>
      <Text style={styles.heading}>Lifestyle factors</Text>
      <Text style={styles.subheading}>
        Diet, substances, and medications directly influence inflammation markers.
      </Text>

      <OnboardingErrorBanner />

      <DietSelector
        value={formState.diet ?? null}
        onChange={(v) => setField('diet', v)}
      />

      <LifestyleQuestion
        question="Smoking history"
        variant="choice"
        options={SMOKING_OPTIONS}
        value={formState.smoking_status ?? null}
        onChange={(v) => setField('smoking_status', v as LifestyleProfileCreate['smoking_status'])}
      />

      <LifestyleQuestion
        question="Alcohol consumption"
        variant="choice"
        options={ALCOHOL_OPTIONS}
        value={formState.alcohol_consumption ?? null}
        onChange={(v) => setField('alcohol_consumption', v as LifestyleProfileCreate['alcohol_consumption'])}
      />

      <View style={styles.medSection}>
        <Text style={styles.medQuestion}>Current medications</Text>
        <Text style={styles.medSubtitle}>
          Include anti-inflammatories, immunosuppressants, or any regular prescriptions.
        </Text>
        <View style={styles.medInputRow}>
          <TextInput
            style={styles.medInput}
            value={medInput}
            onChangeText={setMedInput}
            placeholder="e.g. methotrexate"
            placeholderTextColor="#BBB"
            returnKeyType="done"
            onSubmitEditing={addMedication}
          />
          <TouchableOpacity style={styles.addButton} onPress={addMedication} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {(formState.medications ?? []).length > 0 && (
          <View style={styles.chips}>
            {(formState.medications ?? []).map((med, i) => (
              <TouchableOpacity
                key={i}
                style={styles.chip}
                onPress={() => removeMedication(i)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{med} ×</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {(formState.medications ?? []).length === 0 && (
          <TouchableOpacity
            onPress={() => setField('medications', [])}
            activeOpacity={0.7}
            style={styles.noneButton}
          >
            <Text style={styles.noneText}>None / tap to skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.nextButton}
        onPress={() => router.push('./activity' as never)}
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
  medSection: { marginBottom: 24 },
  medQuestion: { fontSize: 17, fontWeight: '600', color: '#1A1A1A', marginBottom: 6 },
  medSubtitle: { fontSize: 14, color: '#666', marginBottom: 10 },
  medInputRow: { flexDirection: 'row', gap: 10 },
  medInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#FFF',
    color: '#1A1A1A',
  },
  addButton: {
    backgroundColor: '#E55A4E',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    backgroundColor: '#FFF5F4',
    borderWidth: 1.5,
    borderColor: '#E55A4E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { color: '#E55A4E', fontWeight: '600', fontSize: 13 },
  noneButton: { marginTop: 10 },
  noneText: { color: '#999', fontSize: 14 },
  nextButton: {
    backgroundColor: '#E55A4E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  nextButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
