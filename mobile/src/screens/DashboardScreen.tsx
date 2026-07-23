import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useDashboardData } from '../hooks/useDashboardData';
import TrackerCard from '../components/TrackerCard';
import MoodTrendChart from '../components/MoodTrendChart';
import EnergyTrendChart from '../components/EnergyTrendChart';
import LowMoodBanner from '../components/LowMoodBanner';

/**
 * Requirements: 6.1, 6.2, 6.6, 6.7, 7.4, 7.5, 7.6
 */
export default function DashboardScreen(): JSX.Element {
  const router = useRouter();
  const { data: cards, isLoading, isRefetching, refetch } = useDashboardData();

  const moodTracker = cards?.find((c) => c.tracker.isBuiltin && c.tracker.name === 'Mood');
  const energyTracker = cards?.find((c) => c.tracker.isBuiltin && c.tracker.name === 'Energy');

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Aucun tracker pour l'instant</Text>
        <Pressable style={styles.cta} onPress={() => router.push('/trackers/new')}>
          <Text style={styles.ctaText}>Créer mon premier tracker</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={cards}
      keyExtractor={(item) => item.tracker.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      ListHeaderComponent={
        <>
          {moodTracker && typeof moodTracker.latestEntryValue === 'number' && (
            <LowMoodBanner moodValue={moodTracker.latestEntryValue} />
          )}
          {moodTracker && <MoodTrendChart moodTrackerId={moodTracker.tracker.id} />}
          {energyTracker && <EnergyTrendChart energyTrackerId={energyTracker.tracker.id} />}
        </>
      }
      renderItem={({ item }) => (
        <TrackerCard data={item} onPress={() => router.push(`/trackers/${item.tracker.id}/log`)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  emptyTitle: { fontSize: 16, color: '#666' },
  cta: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  ctaText: { color: '#fff', fontWeight: '600' },
});
