import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { updateTracker } from '../../api/trackers';
import type { Tracker } from '../../api/trackers';
import TrackerFormFields, {
  frequencyFromForm,
  validRangeFromForm,
} from '../../components/TrackerFormFields';
import type { TrackerFormValues } from '../../components/TrackerFormFields';
import { useOnboarding } from '../../lib/onboardingContext';

function formValuesFromTracker(tracker: Tracker): TrackerFormValues {
  const frequencyType =
    tracker.frequency === 'daily' || tracker.frequency === 'weekly' ? tracker.frequency : 'custom';

  return {
    name: tracker.name,
    unit: tracker.unit ?? '',
    frequencyType,
    intervalDays:
      typeof tracker.frequency === 'object' ? String(tracker.frequency.intervalDays) : '2',
    validRangeEnabled: tracker.validRange !== null,
    validMin: tracker.validRange ? String(tracker.validRange.min) : '',
    validMax: tracker.validRange ? String(tracker.validRange.max) : '',
    isHabit: tracker.isHabit,
    graceEnabled: tracker.graceEnabled,
  };
}

/**
 * Requirements: 11.3
 */
export default function TrackerEditScreen() {
  const router = useRouter();
  const { createdTrackers } = useOnboarding();
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<TrackerFormValues | null>(
    createdTrackers[0] ? formValuesFromTracker(createdTrackers[0]) : null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (createdTrackers.length === 0 || !values) {
    router.replace('/(onboarding)/complete');
    return null;
  }

  const tracker = createdTrackers[index]!;
  const isLast = index === createdTrackers.length - 1;

  async function handleNext(): Promise<void> {
    setFieldErrors({});
    const frequency = frequencyFromForm(values!);
    const validRange = validRangeFromForm(values!);
    if (frequency === null) {
      setFieldErrors({ frequency: 'Intervalle personnalisé invalide (minimum 1 jour)' });
      return;
    }
    if (validRange === null) {
      setFieldErrors({ validRange: 'Plage invalide : le minimum doit être inférieur au maximum' });
      return;
    }

    setSaving(true);
    try {
      await updateTracker(tracker.id, {
        name: values!.name,
        ...(values!.unit ? { unit: values!.unit } : {}),
        frequency,
        ...(validRange ? { validRange } : {}),
        isHabit: values!.isHabit,
        graceEnabled: values!.isHabit && values!.graceEnabled,
      });

      if (isLast) {
        router.push('/(onboarding)/complete');
      } else {
        const nextIndex = index + 1;
        setIndex(nextIndex);
        setValues(formValuesFromTracker(createdTrackers[nextIndex]!));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.step}>
        Tracker {index + 1} / {createdTrackers.length}
      </Text>
      <Text style={styles.title}>Personnalisez "{tracker.name}"</Text>

      <TrackerFormFields values={values} onChange={setValues} fieldErrors={fieldErrors} />

      <Pressable style={styles.primaryButton} onPress={() => void handleNext()} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>{isLast ? 'Terminer' : 'Suivant'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.skip}>Passer</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  step: { fontSize: 13, color: '#888', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  primaryButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  skip: { color: '#888', marginTop: 16, fontSize: 14, textAlign: 'center' },
});
