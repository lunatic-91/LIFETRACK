import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchTrackers, createTracker } from '../../api/trackers';
import { TRACKER_TEMPLATES, MAX_ACTIVE_TRACKERS, resolveBatchSelection } from '../../lib/trackerTemplates';
import { useOnboarding } from '../../lib/onboardingContext';

/**
 * Requirements: 11.2, 11.3, 11.6, 11.7, 2.10
 */
export default function TemplateSelectionScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedTemplateIds, setSelectedTemplateIds, setCreatedTrackers } = useOnboarding();
  const [creating, setCreating] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  const { data: existingTrackers, isLoading } = useQuery({
    queryKey: ['trackers', 'onboarding-count'],
    queryFn: () => fetchTrackers(),
  });

  const activeCount = existingTrackers?.length ?? 0;
  const remainingCapacity = Math.max(0, MAX_ACTIVE_TRACKERS - activeCount);

  function toggle(templateId: string): void {
    setLimitNotice(null);
    if (selectedTemplateIds.includes(templateId)) {
      setSelectedTemplateIds(selectedTemplateIds.filter((id) => id !== templateId));
      return;
    }
    if (selectedTemplateIds.length >= remainingCapacity) {
      setLimitNotice(`Limite atteinte : ${remainingCapacity} tracker(s) restant(s) sur 50.`);
      return;
    }
    setSelectedTemplateIds([...selectedTemplateIds, templateId]);
  }

  async function handleNext(): Promise<void> {
    if (selectedTemplateIds.length === 0) {
      router.push('/(onboarding)/complete');
      return;
    }

    const selectedTemplates = TRACKER_TEMPLATES.filter((t) => selectedTemplateIds.includes(t.id));
    const { toCreate } = resolveBatchSelection(activeCount, selectedTemplates);

    setCreating(true);
    try {
      // Sequential on purpose: keeps behaviour predictable and easy to
      // reason about if the server-side limit is hit mid-batch.
      const created = [];
      for (const template of toCreate) {
        created.push(await createTracker(template.defaults));
      }
      setCreatedTrackers(created);
      await queryClient.invalidateQueries({ queryKey: ['trackers'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/(onboarding)/edit');
    } finally {
      setCreating(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Choisissez vos trackers</Text>
      <Text style={styles.subtitle}>Sélectionnez-en un ou plusieurs pour commencer.</Text>

      {limitNotice && (
        <View style={styles.limitBanner}>
          <Text style={styles.limitBannerText}>{limitNotice}</Text>
        </View>
      )}

      <View style={styles.grid}>
        {TRACKER_TEMPLATES.map((template) => {
          const selected = selectedTemplateIds.includes(template.id);
          return (
            <Pressable
              key={template.id}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => toggle(template.id)}
            >
              <Text style={styles.cardIcon}>{template.icon}</Text>
              <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                {template.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.primaryButton} onPress={() => void handleNext()} disabled={creating}>
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {selectedTemplateIds.length > 0 ? 'Continuer' : 'Passer cette étape'}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.skip}>Passer l'onboarding</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  limitBanner: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 },
  limitBannerText: { color: '#dc2626', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  card: {
    width: '30%',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  cardSelected: { borderColor: '#111', backgroundColor: '#f5f5f5' },
  cardIcon: { fontSize: 28 },
  cardLabel: { fontSize: 13, color: '#444' },
  cardLabelSelected: { fontWeight: '700', color: '#111' },
  primaryButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  skip: { color: '#888', marginTop: 16, fontSize: 14, textAlign: 'center' },
});
