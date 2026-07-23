import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { fetchTrackers } from '../api/trackers';
import type { Tracker } from '../api/trackers';

/**
 * Requirements: 2.1, 2.3, 2.5, 2.9
 */
export default function TrackerListScreen(): JSX.Element {
  const router = useRouter();
  const { data: trackers, isLoading } = useQuery({
    queryKey: ['trackers', { includeArchived: true }],
    queryFn: () => fetchTrackers({ includeArchived: true }),
  });

  const activeCount = trackers?.filter((t) => !t.isArchived).length ?? 0;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{activeCount} / 50 trackers actifs</Text>
        <Pressable
          style={[styles.addButton, activeCount >= 50 && styles.addButtonDisabled]}
          disabled={activeCount >= 50}
          onPress={() => router.push('/trackers/new')}
        >
          <Text style={styles.addButtonText}>+ Nouveau</Text>
        </Pressable>
      </View>

      <FlatList
        data={trackers ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Aucun tracker pour l'instant</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TrackerRow tracker={item} onPress={() => router.push(`/trackers/${item.id}/edit`)} />
        )}
      />
    </View>
  );
}

function TrackerRow({ tracker, onPress }: { tracker: Tracker; onPress: () => void }): JSX.Element {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{tracker.name}</Text>
        <Text style={styles.rowMeta}>
          {tracker.dataType}
          {tracker.unit ? ` · ${tracker.unit}` : ''}
          {tracker.isHabit ? ' · habit' : ''}
        </Text>
      </View>
      {tracker.isArchived && (
        <View style={styles.archivedBadge}>
          <Text style={styles.archivedBadgeText}>Archivé</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  count: { color: '#666', fontSize: 13 },
  addButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonDisabled: { backgroundColor: '#ccc' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: { color: '#888' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  archivedBadge: {
    backgroundColor: '#eee',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  archivedBadgeText: { fontSize: 11, color: '#666', fontWeight: '600' },
});
