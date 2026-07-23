import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchGoal, updateGoal } from '../api/trackers';
import type { UpdateGoalRequest } from '../api/trackers';
import { getFieldErrors, getErrorMessage } from '../lib/apiErrors';

function todayLocalDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Requirements: 5.8
 */
export default function EditGoalScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = id;

  const { data: goal, isLoading } = useQuery({
    queryKey: ['goal', goalId],
    queryFn: () => fetchGoal(goalId),
  });

  const [targetValue, setTargetValue] = useState('');
  const [deadline, setDeadline] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (goal) {
      setTargetValue(String(goal.targetValue));
      setDeadline(goal.deadline);
    }
  }, [goal]);

  async function handleSubmit(): Promise<void> {
    setFieldErrors({});
    setTopError(null);

    const errors: Record<string, string> = {};
    const target = Number(targetValue);
    if (targetValue === '' || Number.isNaN(target) || target <= 0) {
      errors['targetValue'] = 'La valeur cible doit être un nombre positif';
    }
    if (!deadline) {
      errors['deadline'] = 'Choisissez une date limite (AAAA-MM-JJ)';
    } else if (deadline < todayLocalDate()) {
      errors['deadline'] = 'La date limite doit être dans le futur';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const req: UpdateGoalRequest = { targetValue: target, deadline };

    setSubmitting(true);
    try {
      await updateGoal(goalId, req);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['goals'] }),
        queryClient.invalidateQueries({ queryKey: ['goal', goalId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      router.back();
    } catch (err) {
      const fields = getFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
      } else {
        setTopError(getErrorMessage(err, "Impossible de mettre à jour l'objectif"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !goal) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Modifier l'objectif</Text>

      {topError && <Text style={styles.error}>{topError}</Text>}

      <Text style={styles.label}>Valeur cible</Text>
      <TextInput
        style={styles.input}
        value={targetValue}
        onChangeText={setTargetValue}
        keyboardType="numeric"
      />
      {fieldErrors['targetValue'] && <Text style={styles.error}>{fieldErrors['targetValue']}</Text>}

      <Text style={styles.label}>Date limite (AAAA-MM-JJ)</Text>
      <TextInput
        style={styles.input}
        value={deadline}
        onChangeText={setDeadline}
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
          <Text style={styles.submitButtonText}>Enregistrer</Text>
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
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  error: { color: '#dc2626', fontSize: 13, marginTop: 4 },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
});
