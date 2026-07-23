import { View, Text, Pressable, StyleSheet } from 'react-native';

import type { TrackerCardData } from '../hooks/useDashboardData';

interface Props {
  data: TrackerCardData;
  onPress?: () => void;
}

/**
 * Requirements: 6.2, 6.6
 */
export default function TrackerCard({ data, onPress }: Props) {
  const { tracker, currentStreak, latestEntryValue, hasPendingEntryToday, goalProgressPct } = data;

  return (
    <Pressable style={[styles.card, hasPendingEntryToday && styles.cardPending]} onPress={onPress}>
      {hasPendingEntryToday && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>À faire</Text>
        </View>
      )}

      <Text style={styles.name}>{tracker.name}</Text>

      <View style={styles.row}>
        <Text style={styles.value}>
          {latestEntryValue === null ? '—' : String(latestEntryValue)}
          {tracker.unit ? ` ${tracker.unit}` : ''}
        </Text>

        {tracker.isHabit && <Text style={styles.streak}>🔥 {currentStreak}j</Text>}
      </View>

      {goalProgressPct !== null && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, Math.max(0, goalProgressPct))}%` },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  cardPending: {
    borderColor: '#111',
    borderWidth: 1.5,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontSize: 20, fontWeight: '500' },
  streak: { fontSize: 14, color: '#888' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eee',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#111' },
});
