import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TREND_ARROW: Record<string, string> = {
  up: '↑',
  down: '↓',
  neutral: '→',
};

interface BiometricCardProps {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  highlight?: boolean;
}

export function BiometricCard({ label, value, trend, highlight }: BiometricCardProps) {
  return (
    <View style={[styles.card, highlight && styles.cardHighlight]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {trend ? (
          <Text style={[styles.trend, trend === 'up' && styles.trendUp, trend === 'down' && styles.trendDown]}>
            {TREND_ARROW[trend]}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    flex: 1,
    minWidth: '45%',
    margin: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1.5,
    borderColor: '#F0F0F0',
  },
  cardHighlight: {
    borderColor: '#E55A4E',
  },
  label: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  trend: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    color: '#888',
  },
  trendUp: {
    color: '#2ECC71',
  },
  trendDown: {
    color: '#E55A4E',
  },
});
