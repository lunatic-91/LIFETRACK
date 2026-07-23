import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { fetchInsights } from '../api/insights';
import type { Insight, TrendDirection } from '../api/insights';
import { fetchTrackers } from '../api/trackers';

const MIN_ENTRIES_FOR_TREND = 14;

const TREND_LABEL: Record<TrendDirection, string> = {
  improving: '📈 En amélioration',
  stable: '➡️ Stable',
  declining: '📉 En baisse',
};

/**
 * Requirements: 9.3, 9.6
 */
export default function InsightsScreen(): JSX.Element {
  const { data: insights, isLoading: loadingInsights } = useQuery({
    queryKey: ['insights'],
    queryFn: fetchInsights,
  });
  const { data: trackers, isLoading: loadingTrackers } = useQuery({
    queryKey: ['trackers', { includeArchived: false }],
    queryFn: () => fetchTrackers(),
  });

  if (loadingInsights || loadingTrackers) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const trackerName = (trackerId: string): string =>
    trackers?.find((t) => t.id === trackerId)?.name ?? 'Tracker';

  // Req 9.3: the API already returns insights ordered by generatedAt DESC.
  const sortedInsights = [...(insights ?? [])].sort((a, b) =>
    a.generatedAt < b.generatedAt ? 1 : -1,
  );

  // Req 9.6: a numeric tracker with no trend insight yet hasn't reached the
  // 14-entry threshold on the backend — surface that explicitly rather than
  // silently omitting it. (Trend insights only exist for numeric trackers.)
  const trackersMissingTrend = (trackers ?? []).filter(
    (t) =>
      t.dataType === 'numeric' &&
      !sortedInsights.some((i) => i.type === 'trend' && i.trackerId === t.id),
  );

  return (
    <FlatList
      data={sortedInsights}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Aucun insight généré pour l'instant</Text>
        </View>
      }
      renderItem={({ item }) => <InsightRow insight={item} trackerName={trackerName} />}
      ListFooterComponent={
        trackersMissingTrend.length > 0 ? (
          <View style={styles.footer}>
            <Text style={styles.footerTitle}>Pas encore assez de données</Text>
            {trackersMissingTrend.map((t) => (
              <Text key={t.id} style={styles.footerRow}>
                {t.name} — {MIN_ENTRIES_FOR_TREND} entrées minimum nécessaires pour une tendance
              </Text>
            ))}
          </View>
        ) : null
      }
    />
  );
}

function InsightRow({
  insight,
  trackerName,
}: {
  insight: Insight;
  trackerName: (id: string) => string;
}): JSX.Element {
  if (insight.type === 'trend') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{trackerName(insight.trackerId)}</Text>
        <Text style={styles.cardBody}>{TREND_LABEL[insight.direction]}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {trackerName(insight.trackerIdA)} ↔ {trackerName(insight.trackerIdB)}
      </Text>
      <Text style={styles.cardBody}>Corrélation : {insight.pearsonR.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16 },
  emptyText: { color: '#888' },
  card: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { fontSize: 14, color: '#666', marginTop: 4 },
  footer: { marginTop: 8 },
  footerTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 8 },
  footerRow: { fontSize: 13, color: '#999', marginBottom: 6 },
});
