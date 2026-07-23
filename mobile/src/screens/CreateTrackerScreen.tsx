import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { createTracker } from '../api/trackers';
import type { CreateTrackerRequest } from '../api/trackers';
import TrackerFormFields, {
  defaultTrackerFormValues,
  frequencyFromForm,
  validRangeFromForm,
} from '../components/TrackerFormFields';
import { getFieldErrors, getErrorMessage } from '../lib/apiErrors';

const DATA_TYPES = ['numeric', 'boolean', 'text'] as const;

/**
 * Requirements: 2.1, 2.2, 2.3, 2.9, 2.10
 */
export default function CreateTrackerScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [dataType, setDataType] = useState<(typeof DATA_TYPES)[number]>('numeric');
  const [categoriesInput, setCategoriesInput] = useState('');
  const [values, setValues] = useState(defaultTrackerFormValues());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
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

    const req: CreateTrackerRequest = {
      name: values.name,
      dataType,
      frequency,
      ...(values.unit ? { unit: values.unit } : {}),
      ...(validRange ? { validRange } : {}),
      ...(categoriesInput.trim()
        ? {
            categories: categoriesInput
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean),
          }
        : {}),
      isHabit: values.isHabit,
      graceEnabled: values.isHabit && values.graceEnabled,
    };

    setSubmitting(true);
    try {
      await createTracker(req);
      await queryClient.invalidateQueries({ queryKey: ['trackers'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    } catch (err) {
      const fields = getFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
      } else {
        setTopError(getErrorMessage(err, 'Impossible de créer le tracker'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Nouveau tracker</Text>

      {topError && (
        <View style={styles.limitBanner}>
          <Text style={styles.limitBannerText}>{topError}</Text>
        </View>
      )}

      <Text style={styles.label}>Type de donnée</Text>
      <View style={styles.segmented}>
        {DATA_TYPES.map((option) => (
          <Pressable
            key={option}
            style={[styles.segment, dataType === option && styles.segmentActive]}
            onPress={() => setDataType(option)}
          >
            <Text style={[styles.segmentText, dataType === option && styles.segmentTextActive]}>
              {option === 'numeric' ? 'Numérique' : option === 'boolean' ? 'Oui/Non' : 'Texte'}
            </Text>
          </Pressable>
        ))}
      </View>

      <TrackerFormFields values={values} onChange={setValues} fieldErrors={fieldErrors} />

      <Text style={styles.label}>Catégories (séparées par des virgules, optionnel)</Text>
      <TextInput
        style={styles.input}
        value={categoriesInput}
        onChangeText={setCategoriesInput}
        placeholder="ex. santé, bien-être"
      />

      <Pressable
        style={styles.submitButton}
        onPress={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Créer</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: '#111', borderColor: '#111' },
  segmentText: { fontSize: 13, color: '#111' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  limitBanner: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 },
  limitBannerText: { color: '#dc2626', fontSize: 13 },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
});
