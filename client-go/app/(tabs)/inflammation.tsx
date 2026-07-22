import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInflammationScore } from '@/hooks/useInflammationScore';
import { STORAGE_KEY_USER_ID } from '@/constants/config';

const LEVEL_COLORS: Record<number, string> = {
  1: '#2ECC71',
  2: '#A8D672',
  3: '#F5A623',
  4: '#E55A4E',
  5: '#8B0000',
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'None',
  2: 'Mild',
  3: 'Moderate',
  4: 'High',
  5: 'Very High',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InflammationScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_USER_ID).then((id) => {
      setUserId(id);
      setLoadingUser(false);
    });
  }, []);

  const { inflammation, loading, error } = useInflammationScore(loadingUser ? undefined as unknown as null : userId);

  if (loadingUser || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E55A4E" />
      </View>
    );
  }

  if (error || !inflammation) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Could not load score.'}</Text>
      </View>
    );
  }

  const levelColor = LEVEL_COLORS[inflammation.level] ?? '#888';
  const levelLabel = LEVEL_LABELS[inflammation.level] ?? 'Unknown';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Inflammation Score</Text>
      <Text style={styles.updated}>Updated {formatDate(inflammation.computed_at)}</Text>

      <View style={styles.scoreCard}>
        <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
          <Text style={styles.levelLabel}>{levelLabel}</Text>
        </View>
        <Text style={styles.scoreNumber}>{inflammation.score.toFixed(1)}</Text>
        <Text style={styles.scoreScale}>out of 5.0</Text>
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>What this means</Text>
        <Text style={styles.insightText}>{inflammation.insight}</Text>
      </View>

      <View style={styles.scaleCard}>
        <Text style={styles.scaleTitle}>Inflammation scale</Text>
        {[1, 2, 3, 4, 5].map((level) => (
          <View key={level} style={[styles.scaleRow, inflammation.level === level && styles.scaleRowActive]}>
            <View style={[styles.scaleDot, { backgroundColor: LEVEL_COLORS[level] }]} />
            <Text style={[styles.scaleLabel, inflammation.level === level && styles.scaleLabelActive]}>
              {level} — {LEVEL_LABELS[level]}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F7' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F7F7' },
  heading: { fontSize: 24, fontWeight: '700', color: '#1A1A1A' },
  updated: { fontSize: 13, color: '#AAA', marginTop: 4, marginBottom: 24 },
  scoreCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 16,
  },
  levelBadge: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 16,
  },
  levelLabel: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  scoreNumber: { fontSize: 64, fontWeight: '800', color: '#1A1A1A' },
  scoreScale: { fontSize: 16, color: '#AAA', marginTop: 4 },
  insightCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  insightTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  insightText: { fontSize: 15, color: '#333', lineHeight: 23 },
  scaleCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scaleTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  scaleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  scaleRowActive: { backgroundColor: '#F9F9F9', borderRadius: 8, paddingHorizontal: 8 },
  scaleDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  scaleLabel: { fontSize: 14, color: '#666' },
  scaleLabelActive: { fontWeight: '700', color: '#1A1A1A' },
  errorText: { color: '#888', fontSize: 15 },
});
