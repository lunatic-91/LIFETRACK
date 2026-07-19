import { useQuery } from '@tanstack/react-query';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

import { fetchEntries } from '../api/trackers';
import { computeWeeklyTrend } from '../lib/trends';
import WeeklyBarChart from './WeeklyBarChart';

interface Props {
  energyTrackerId: string;
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Requirements: 7.6
 */
export default function EnergyTrendChart({ energyTrackerId }: Props) {
  const today = todayLocalDate();

  const { data, isLoading } = useQuery({
    queryKey: ['entries', energyTrackerId, 'weekly'],
    queryFn: () =>
      fetchEntries(energyTrackerId, {
        start: new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10),
        end: today,
      }),
  });

  if (isLoading) return <ActivityIndicator />;

  const points = computeWeeklyTrend(
    (data ?? []).map((e) => ({ localDate: e.localDate, value: Number(e.value) })),
    today,
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Énergie — 7 derniers jours</Text>
      <WeeklyBarChart points={points} color="#22c55e" maxScale={10} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#444' },
});
