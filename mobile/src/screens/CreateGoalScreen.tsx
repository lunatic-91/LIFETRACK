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
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchTrackers, createGoal } from '../api/trackers';
import type { CreateGoalRequest } from '../api/trackers';
import { getFieldErrors, getErrorMessage } from '../lib/apiErrors';

function todayLocalDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Requirements: 5.1, 5.2
 */
export default function CreateGoalScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: trackers, isLoading } = useQuery({
    queryKey: ['trackers', { includeArchived: false }],
    queryFn: () => fetchTrackers(),
  });
  const numericTrackers = trackers?.filter((t) => t.dataType === 'numeric') ?? [];

  const [trackerId, setTrackerId] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState('');
  const [direction, setDirection] = useState<'ascending' | 'descending'>('ascending');
  const [deadline, setDeadline] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    setFieldErrors({});
    setTopError(null);

    const errors: Record<string, string> = {};
    if (!trackerId) errors['trackerId'] = 'Choisissez un tracker';

    const target = Number(targetValue);
    if (targetValue === '' || Number.isNaN(target) || target <= 0) {
      errors['targetValue'] = 'La valeur cible doit être un nombre positif';
    }

    // Req 16.1: validate the deadline is in the future before submitting.
    if (!deadline) {
      errors['deadline'] = 'Choisissez une date limite (AAAA-MM-JJ)';
    } else if (deadline < todayLocalDate()) {
      errors['deadline'] = 'La date limite doit être dans le futur';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const req: CreateGoalRequest = {
      trackerId: trackerId!,
      targetValue: target,
      direction,
      deadline,
    };

    setSubmitting(true);
    try {
      await createGoal(req);
      await queryClient.invalidateQueries({ queryKey: ['goals'] });
      router.back();
    } catch (err) {
      const fields = getFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
      } else {
        setTopError(getErrorMessage(err, "Impossible de créer l'objectif"));
      }
    } finally {
      setSubmitting(false);
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
      <Text style={styles.title}>Nouvel objectif</Text>

      {topError && <Text style={styles.error}>{topError}</Text>}

      <Text style={styles.label}>Tracker</Text>
      {numericTrackers.length === 0 ? (
        <Text style={styles.hint}>Aucun tracker numérique disponible. Créez-en un d'abord.</Text>
      ) : (
        <View style={styles.pickerList}>
          {numericTrackers.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.pickerRow, trackerId === t.id && styles.pickerRowActive]}
              onPress={() => setTrackerId(t.id)}
            >
              <Text style={[styles.pickerText, trackerId === t.id && styles.pickerTextActive]}>
                {t.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {fieldErrors['trackerId'] && <Text style={styles.error}>{fieldErrors['trackerId']}</Text>}

      <Text style={styles.label}>Direction</Text>
      <View style={styles.segmented}>
        <Pressable
          style={[styles.segment, direction === 'ascending' && styles.segmentActive]}
          onPress={() => setDirection('ascending')}
        >
          <Text style={[styles.segmentText, direction === 'ascending' && styles.segmentTextActive]}>
            Atteindre (monter)
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, direction === 'descending' && styles.segmentActive]}
          onPress={() => setDirection('descending')}
        >
          <Text
            style={[styles.segmentText, direction === 'descending' && styles.segmentTextActive]}
          >
            Descendre à
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Valeur cible</Text>
      <TextInput
        style={styles.input}
        value={targetValue}
        onChangeText={setTargetValue}
        keyboardType="numeric"
        placeholder="ex. 10"
      />
      {fieldErrors['targetValue'] && <Text style={styles.error}>{fieldErrors['targetValue']}</Text>}

      <Text style={styles.label}>Date limite (AAAA-MM-JJ)</Text>
      <TextInput
        style={styles.input}
        value={deadline}
        onChangeText={setDeadline}
        placeholder={todayLocalDate()}
        autoCapitalize="none"
      />
      {fieldErrors['deadline'] && <Text style={styles.error}>{fieldErrors['deadline']}</Text>}

      <Pressable
        style={styles.submitButton}
        onPress={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Créer l'objectif</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  hint: { color: '#888', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  error: { color: '#dc2626', fontSize: 13, marginTop: 4 },
  pickerList: { gap: 8 },
  pickerRow: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  pickerRowActive: { backgroundColor: '#111', borderColor: '#111' },
  pickerText: { fontSize: 14, color: '#111' },
  pickerTextActive: { color: '#fff', fontWeight: '600' },
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
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
});
