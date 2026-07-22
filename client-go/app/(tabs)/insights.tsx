import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useHealthData } from '@/hooks/useHealthData';
import { TrendChart } from '@/components/dashboard/TrendChart';

export default function InsightsScreen() {
  const { snapshot, loading, error, refetch } = useHealthData();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E55A4E" />
      </View>
    );
  }

  if (error || !snapshot) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'No data available'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch} activeOpacity={0.8}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hrvData = snapshot.hrv.map((s) => s.sdnn);
  const sleepData = snapshot.sleep.map((s) => s.durationHours);
  const rhrData = snapshot.rhr.map((s) => s.bpm);

  const avgHRV = (hrvData.reduce((a, b) => a + b, 0) / hrvData.length).toFixed(1);
  const avgSleep = (sleepData.reduce((a, b) => a + b, 0) / sleepData.length).toFixed(1);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Trends</Text>
      <Text style={styles.subheading}>14-day history from mock data</Text>

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{avgHRV} ms</Text>
          <Text style={styles.statLabel}>Avg HRV</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{avgSleep} hrs</Text>
          <Text style={styles.statLabel}>Avg Sleep</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <TrendChart data={hrvData} title="Heart Rate Variability (SDNN)" color="#E55A4E" height={130} />
      </View>

      <View style={styles.chartCard}>
        <TrendChart data={sleepData} title="Sleep Duration" color="#5B8DEF" height={130} />
      </View>

      <View style={styles.chartCard}>
        <TrendChart data={rhrData} title="Resting Heart Rate" color="#F5A623" height={130} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F7F7F7' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F7F7' },
  heading: { fontSize: 24, fontWeight: '700', color: '#1A1A1A' },
  subheading: { fontSize: 14, color: '#888', marginTop: 4, marginBottom: 20 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  chartCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  errorText: { color: '#888', fontSize: 15, marginBottom: 16 },
  retryButton: {
    backgroundColor: '#E55A4E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: { color: '#FFF', fontWeight: '700' },
});
