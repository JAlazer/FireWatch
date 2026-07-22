import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TrendChartProps {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
  title?: string;
}

export function TrendChart({ data, labels, color = '#E55A4E', height = 120, title }: TrendChartProps) {
  if (data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={[styles.chartArea, { height }]}>
        {data.map((value, index) => {
          const barHeight = Math.max(4, ((value - min) / range) * height);
          return (
            <View key={index} style={styles.barWrapper}>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { height: barHeight, backgroundColor: color }]} />
              </View>
              {labels?.[index] ? <Text style={styles.barLabel}>{labels[index]}</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  barContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '80%',
  },
  bar: {
    borderRadius: 3,
    width: '100%',
  },
  barLabel: {
    fontSize: 9,
    color: '#AAA',
    marginTop: 3,
  },
});
