import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealthData } from '@/hooks/useHealthData';
import { BiometricCard } from '@/components/dashboard/BiometricCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { STORAGE_KEY_USER_ID } from '@/constants/config';

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

export default function DashboardScreen() {
  const { snapshot, loading, error, refetch } = useHealthData();
  const [_userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_USER_ID).then(setUserId);
  }, []);

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

  const latestHRV = snapshot.hrv[snapshot.hrv.length - 1];
  const latestRHR = snapshot.rhr[snapshot.rhr.length - 1];
  const latestSleep = snapshot.sleep[snapshot.sleep.length - 1];
  const latestSkinTemp = snapshot.skinTemperature[snapshot.skinTemperature.length - 1];
  const latestRespRate = snapshot.respiratoryRate[snapshot.respiratoryRate.length - 1];
  const latestSpO2 = snapshot.spo2[snapshot.spo2.length - 1];

  const prevHRV = snapshot.hrv[snapshot.hrv.length - 2]?.sdnn;
  const hrvTrend = prevHRV
    ? latestHRV.sdnn > prevHRV
      ? 'up'
      : latestHRV.sdnn < prevHRV
      ? 'down'
      : 'neutral'
    : undefined;

  const prevRHR = snapshot.rhr[snapshot.rhr.length - 2]?.bpm;
  const rhrTrend = prevRHR
    ? latestRHR.bpm < prevRHR
      ? 'up'
      : latestRHR.bpm > prevRHR
      ? 'down'
      : 'neutral'
    : undefined;

  const hrvData = snapshot.hrv.map((s) => s.sdnn);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Today's Metrics</Text>
      <Text style={styles.subheading}>Based on your last {snapshot.hrv.length} days</Text>

      <View style={styles.cardsGrid}>
        <BiometricCard
          label="HRV"
          value={`${fmt(latestHRV.sdnn)} ms`}
          trend={hrvTrend as 'up' | 'down' | 'neutral' | undefined}
        />
        <BiometricCard
          label="Resting HR"
          value={`${latestRHR.bpm} bpm`}
          trend={rhrTrend as 'up' | 'down' | 'neutral' | undefined}
        />
        <BiometricCard label="Sleep" value={`${fmt(latestSleep.durationHours)} hrs`} />
        <BiometricCard label="Skin Temp" value={`${fmt(latestSkinTemp.celsius)} °C`} />
        <BiometricCard label="Resp Rate" value={`${fmt(latestRespRate.breathsPerMinute)} /min`} />
        <BiometricCard label="SpO₂" value={`${fmt(latestSpO2.percentage)} %`} />
      </View>

      <View style={styles.chartCard}>
        <TrendChart data={hrvData} title="HRV — 14-day trend" color="#E55A4E" height={120} />
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
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    margin: -6,
  },
  chartCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
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
