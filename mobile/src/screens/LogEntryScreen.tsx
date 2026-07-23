import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchTracker, logEntry, editEntry } from '../api/trackers';
import { getConflictExistingEntryId, isConflictError, getErrorMessage } from '../lib/apiErrors';

function todayLocalDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Requirements: 3.1, 3.2, 3.4, 3.5, 3.7, 3.8
 */
export default function LogEntryScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackerId = id;

  const { data: tracker, isLoading } = useQuery({
    queryKey: ['tracker', trackerId],
    queryFn: () => fetchTracker(trackerId),
  });

  const [numericValue, setNumericValue] = useState('');
  const [booleanValue, setBooleanValue] = useState<boolean | null>(null);
  const [textValue, setTextValue] = useState('');
  const [note, setNote] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [truncationWarning, setTruncationWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflictEntryId, setConflictEntryId] = useState<string | null>(null);

  function currentValue(): number | boolean | string | null {
    if (!tracker) return null;
    if (tracker.dataType === 'numeric') {
      const n = Number(numericValue);
      return numericValue !== '' && !Number.isNaN(n) ? n : null;
    }
    if (tracker.dataType === 'boolean') return booleanValue;
    return textValue.trim() ? textValue : null;
  }

  async function submit(overwriteEntryId?: string): Promise<void> {
    const value = currentValue();
    if (value === null) {
      setError('Merci de renseigner une valeur');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = overwriteEntryId
        ? await editEntry(trackerId, overwriteEntryId, { value, ...(note ? { note } : {}) })
        : await logEntry(trackerId, {
            value,
            ...(note ? { note } : {}),
            localDate: todayLocalDate(),
          });

      setTruncationWarning(result.noteTruncated);
      setConflictEntryId(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['trackers'] }),
      ]);

      if (!result.noteTruncated) {
        router.back();
      }
    } catch (err) {
      if (isConflictError(err)) {
        const existingEntryId = getConflictExistingEntryId(err);
        if (existingEntryId) {
          setConflictEntryId(existingEntryId);
        }
      } else {
        setError(getErrorMessage(err, "Impossible d'enregistrer l'entrée"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !tracker) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{tracker.name}</Text>

      {error && <Text style={styles.error}>{error}</Text>}
      {truncationWarning && (
        <Text style={styles.warning}>La note a été raccourcie à 500 caractères.</Text>
      )}

      {tracker.dataType === 'numeric' && (
        <View style={styles.field}>
          <TextInput
            style={styles.numericInput}
            value={numericValue}
            onChangeText={setNumericValue}
            keyboardType="numeric"
            placeholder="0"
          />
          {tracker.unit && <Text style={styles.unit}>{tracker.unit}</Text>}
        </View>
      )}

      {tracker.dataType === 'boolean' && (
        <View style={styles.booleanRow}>
          <Pressable
            style={[styles.booleanButton, booleanValue === true && styles.booleanButtonActive]}
            onPress={() => setBooleanValue(true)}
          >
            <Text style={[styles.booleanText, booleanValue === true && styles.booleanTextActive]}>
              Oui
            </Text>
          </Pressable>
          <Pressable
            style={[styles.booleanButton, booleanValue === false && styles.booleanButtonActive]}
            onPress={() => setBooleanValue(false)}
          >
            <Text style={[styles.booleanText, booleanValue === false && styles.booleanTextActive]}>
              Non
            </Text>
          </Pressable>
        </View>
      )}

      {tracker.dataType === 'text' && (
        <TextInput
          style={styles.textValueInput}
          value={textValue}
          onChangeText={setTextValue}
          multiline
          maxLength={500}
          placeholder="Valeur"
        />
      )}

      <Text style={styles.label}>Note (optionnel)</Text>
      <TextInput
        style={styles.noteInput}
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Ajouter une note..."
      />
      <Text style={styles.noteCount}>{note.length}/500</Text>

      <Pressable style={styles.submitButton} onPress={() => void submit()} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Enregistrer</Text>
        )}
      </Pressable>

      <Modal visible={conflictEntryId !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Une entrée existe déjà aujourd'hui</Text>
            <Text style={styles.modalBody}>
              Voulez-vous remplacer la valeur existante par celle-ci ?
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setConflictEntryId(null)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirm}
                onPress={() => void submit(conflictEntryId ?? undefined)}
              >
                <Text style={styles.modalConfirmText}>Remplacer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16 },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 12 },
  warning: { color: '#b45309', fontSize: 13, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numericInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 14,
    fontSize: 20,
  },
  unit: { fontSize: 16, color: '#666' },
  booleanRow: { flexDirection: 'row', gap: 12 },
  booleanButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  booleanButtonActive: { backgroundColor: '#111', borderColor: '#111' },
  booleanText: { fontSize: 16, color: '#111' },
  booleanTextActive: { color: '#fff', fontWeight: '600' },
  textValueInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  noteCount: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  modalBody: { fontSize: 14, color: '#444', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: '#111', fontWeight: '600' },
  modalConfirm: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontWeight: '600' },
});
