import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchTracker, updateTracker, archiveTracker, deleteTracker } from '../api/trackers';
import type { UpdateTrackerRequest } from '../api/trackers';
import TrackerFormFields, {
  frequencyFromForm,
  validRangeFromForm,
} from '../components/TrackerFormFields';
import type { TrackerFormValues } from '../components/TrackerFormFields';
import { getFieldErrors, getErrorMessage } from '../lib/apiErrors';

function formValuesFromTracker(tracker: {
  name: string;
  unit: string | null;
  frequency: 'daily' | 'weekly' | { intervalDays: number };
  validRange: { min: number; max: number } | null;
  isHabit: boolean;
  graceEnabled: boolean;
}): TrackerFormValues {
  return {
    name: tracker.name,
    unit: tracker.unit ?? '',
    frequencyType: typeof tracker.frequency === 'string' ? tracker.frequency : 'custom',
    intervalDays:
      typeof tracker.frequency === 'string' ? '2' : String(tracker.frequency.intervalDays),
    validRangeEnabled: tracker.validRange !== null,
    validMin: tracker.validRange ? String(tracker.validRange.min) : '',
    validMax: tracker.validRange ? String(tracker.validRange.max) : '',
    isHabit: tracker.isHabit,
    graceEnabled: tracker.graceEnabled,
  };
}

/**
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7
 */
export default function EditTrackerScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackerId = id;

  const { data: tracker, isLoading } = useQuery({
    queryKey: ['tracker', trackerId],
    queryFn: () => fetchTracker(trackerId),
  });

  const [values, setValues] = useState<TrackerFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tracker) {
      setValues(formValuesFromTracker(tracker));
    }
  }, [tracker]);

  async function invalidateAndBack(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trackers'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['tracker', trackerId] }),
    ]);
    router.back();
  }

  async function handleSubmit(): Promise<void> {
    if (!values) return;
    setFieldErrors({});
    setTopError(null);

    const frequency = frequencyFromForm(values);
    const validRange = validRangeFromForm(values);
    if (frequency === null) {
      setFieldErrors({ frequency: 'Intervalle personnalisé invalide (minimum 1 jour)' });
      return;
    }
    if (validRange === null) {
      setFieldErrors({ validRange: 'Plage invalide : le minimum doit être inférieur au maximum' });
      return;
    }

    const req: UpdateTrackerRequest = {
      name: values.name,
      unit: values.unit,
      frequency,
      ...(validRange !== undefined ? { validRange } : {}),
      isHabit: values.isHabit,
      graceEnabled: values.isHabit && values.graceEnabled,
    };

    setSubmitting(true);
    try {
      await updateTracker(trackerId, req);
      await invalidateAndBack();
    } catch (err) {
      const fields = getFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
      } else {
        setTopError(getErrorMessage(err, 'Impossible de mettre à jour le tracker'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(): Promise<void> {
    setSubmitting(true);
    try {
      await archiveTracker(trackerId);
      await invalidateAndBack();
    } catch (err) {
      setTopError(getErrorMessage(err, "Impossible d'archiver le tracker"));
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete(): void {
    Alert.alert(
      'Supprimer ce tracker ?',
      'Toutes les entrées et objectifs associés seront définitivement supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void handleDelete() },
      ],
    );
  }

  async function handleDelete(): Promise<void> {
    setSubmitting(true);
    try {
      await deleteTracker(trackerId);
      await invalidateAndBack();
    } catch (err) {
      setTopError(getErrorMessage(err, 'Impossible de supprimer le tracker'));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !values || !tracker) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Modifier {tracker.name}</Text>

      {topError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{topError}</Text>
        </View>
      )}

      <TrackerFormFields values={values} onChange={setValues} fieldErrors={fieldErrors} />

      <Pressable
        style={styles.submitButton}
        onPress={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Enregistrer</Text>
        )}
      </Pressable>

      <View style={styles.dangerZone}>
        {!tracker.isArchived && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleArchive()}
            disabled={submitting}
          >
            <Text style={styles.secondaryButtonText}>Archiver</Text>
          </Pressable>
        )}

        {/* Req 2.6: delete is disabled while the tracker is archived */}
        <Pressable
          style={[styles.deleteButton, tracker.isArchived && styles.deleteButtonDisabled]}
          onPress={confirmDelete}
          disabled={submitting || tracker.isArchived}
        >
          <Text style={styles.deleteButtonText}>
            {tracker.isArchived ? 'Suppression désactivée (archivé)' : 'Supprimer'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16 },
  errorBanner: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorBannerText: { color: '#dc2626', fontSize: 13 },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  dangerZone: { marginTop: 32, gap: 10 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#111', fontWeight: '600' },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  deleteButtonDisabled: { borderColor: '#ccc' },
  deleteButtonText: { color: '#dc2626', fontWeight: '600' },
});
