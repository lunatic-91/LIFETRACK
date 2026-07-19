import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Polyline, Rect, Circle } from 'react-native-svg';

import { fetchEntries } from '../api/trackers';
import type { Tracker } from '../api/trackers';
import { rangeToDates, scaleToChart, type ChartRange } from '../lib/chartMath';

interface Props {
  tracker: Tracker;
}

const RANGES: ChartRange[] = ['7d', '30d', '90d', '12m'];
const RANGE_LABELS: Record<ChartRange, string> = { '7d': '7j', '30d': '30j', '90d': '90j', '12m': '12m' };

const CHART_WIDTH = 300;
const CHART_HEIGHT = 140;

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Requirements: 6.3, 6.4, 6.5, 6.8
 */
export default function TrackerChart({ tracker }: Props) {
  const [range, setRange] = useState<ChartRange>('7d');
  const today = todayLocalDate();
  const { start, end } = rangeToDates(range, today);

  const { data, isLoading } = useQuery({
    queryKey: ['entries', tracker.id, range],
    queryFn: () => fetchEntries(tracker.id, { start, end }),
  });

  const entries = [...(data ?? [])].sort((a, b) => a.localDate.localeCompare(b.localDate));

  return (
    <View style={styles.container}>
      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <Pressable key={r} onPress={() => setRange(r)} style={[styles.rangeBtn, r === range && styles.rangeBtnActive]}>
            <Text style={[styles.rangeText, r === range && styles.rangeTextActive]}>{RANGE_LABELS[r]}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>Aucune donnée pour cette période</Text>
      ) : tracker.dataType === 'boolean' ? (
        <BarChart entries={entries} />
      ) : (
        <LineChart entries={entries} />
      )}
    </View>
  );
}

function LineChart({ entries }: { entries: { value: number | boolean | string }[] }) {
  const values = entries.map((e) => Number(e.value));
  const points = scaleToChart(values, CHART_WIDTH, CHART_HEIGHT);
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <Polyline points={polylinePoints} fill="none" stroke="#111" strokeWidth={2} />
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#111" />
      ))}
    </Svg>
  );
}

function BarChart({ entries }: { entries: { value: number | boolean | string }[] }) {
  const barWidth = Math.max(4, CHART_WIDTH / entries.length - 4);

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      {entries.map((e, i) => {
        const completed = Boolean(e.value);
        const barHeight = completed ? CHART_HEIGHT : 4;
        const x = i * (CHART_WIDTH / entries.length);
        return (
          <Rect
            key={i}
            x={x}
            y={CHART_HEIGHT - barHeight}
            width={barWidth}
            height={barHeight}
            rx={2}
            fill={completed ? '#22c55e' : '#e5e5e5'}
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  rangeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f0f0f0' },
  rangeBtnActive: { backgroundColor: '#111' },
  rangeText: { fontSize: 12, color: '#444' },
  rangeTextActive: { color: '#fff' },
  empty: { color: '#888', fontSize: 13, paddingVertical: 24, textAlign: 'center' },
});
