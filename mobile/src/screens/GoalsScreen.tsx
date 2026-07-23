import { View, Text, SectionList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { fetchGoals, fetchTrackers } from '../api/trackers';
import type { Goal } from '../api/trackers';

const SECTION_TITLES: Record<'active' | 'completed' | 'expired', string> = {
  active: 'En cours',
  completed: 'Atteints',
  expired: 'Expirés',
};

/**
 * Requirements: 5.1, 5.7
 */
export default function GoalsScreen(): JSX.Element {
  const router = useRouter();

  const { data: grouped, isLoading: loadingGoals } = useQuery({
    queryKey: ['goals'],
    queryFn: fetchGoals,
  });
  const { data: trackers, isLoading: loadingTrackers } = useQuery({
    queryKey: ['trackers', { includeArchived: true }],
    queryFn: () => fetchTrackers({ includeArchived: true }),
  });

  if (loadingGoals || loadingTrackers) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const trackerName = (trackerId: string): string =>
    trackers?.find((t) => t.id === trackerId)?.name ?? 'Tracker';

  const sections = (['active', 'completed', 'expired'] as const)
    .map((key) => ({ key, title: SECTION_TITLES[key], data: grouped?.[key] ?? [] }))
    .filter((section) => section.data.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.addButton} onPress={() => router.push('/goals/new')}>
          <Text style={styles.addButtonText}>+ Nouvel objectif</Text>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Aucun objectif pour l'instant</Text>
          </View>
        }
        renderItem={({ item }) => (
          <GoalRow
            goal={item}
            trackerName={trackerName(item.trackerId)}
            onPress={() =>
              item.status === 'active' ? router.push(`/goals/${item.id}/edit`) : undefined
            }
          />
        )}
      />
    </View>
  );
}

function GoalRow({
  goal,
  trackerName,
  onPress,
}: {
  goal: Goal;
  trackerName: string;
  onPress?: () => void;
}): JSX.Element {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={goal.status !== 'active'}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{trackerName}</Text>
        <Text style={styles.rowMeta}>
          {goal.direction === 'ascending' ? 'Atteindre' : 'Descendre à'} {goal.targetValue} avant le{' '}
          {goal.deadline}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, Math.max(0, goal.progressPct))}%` },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>{Math.round(goal.progressPct)}%</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { padding: 16, alignItems: 'flex-end' },
  addButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: { color: '#888' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginTop: 16, marginBottom: 8 },
  row: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  rowMain: { marginBottom: 8 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#eee', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#111' },
  progressLabel: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'right' },
});
