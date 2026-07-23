import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { fetchTrackers } from '../api/trackers';
import { requestExport, fetchExportJobStatus, resolveDownloadUrl } from '../api/exports';
import type { ExportFormat, ExportJobStatus } from '../api/exports';
import { getErrorMessage } from '../lib/apiErrors';

const POLL_INTERVAL_MS = 2000;

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'processing' }
  | { phase: 'empty' }
  | { phase: 'done'; downloadUrl: string; entryCount: number }
  | { phase: 'error'; message: string };

/**
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.8, 10.9
 */
export default function ExportScreen(): JSX.Element {
  const { data: trackers } = useQuery({
    queryKey: ['trackers', { includeArchived: false }],
    queryFn: () => fetchTrackers(),
  });

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [trackerId, setTrackerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [state, setState] = useState<ScreenState>({ phase: 'idle' });

  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current) clearInterval(pollHandle.current);
    };
  }, []);

  function pollJob(jobId: string): void {
    pollHandle.current = setInterval(() => {
      void (async () => {
        try {
          const status: ExportJobStatus = await fetchExportJobStatus(jobId);
          if (status.status === 'processing') return;

          if (pollHandle.current) clearInterval(pollHandle.current);

          if (status.status === 'failed') {
            setState({ phase: 'error', message: status.errorMessage ?? "L'export a échoué" });
            return;
          }

          if (status.entryCount === 0) {
            setState({ phase: 'empty' });
            return;
          }

          setState({
            phase: 'done',
            downloadUrl: status.downloadUrl ?? '',
            entryCount: status.entryCount ?? 0,
          });
        } catch (err) {
          if (pollHandle.current) clearInterval(pollHandle.current);
          setState({ phase: 'error', message: getErrorMessage(err, "L'export a échoué") });
        }
      })();
    }, POLL_INTERVAL_MS);
  }

  async function handleExport(): Promise<void> {
    setState({ phase: 'processing' });
    try {
      const result = await requestExport({
        format,
        ...(trackerId ? { trackerId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      });

      if (result.status === 'processing') {
        // Req 10.4: large exports (>10k entries) are processed asynchronously.
        pollJob(result.jobId);
        return;
      }

      if (result.entryCount === 0) {
        // Req 10.8: filter matched nothing.
        setState({ phase: 'empty' });
        return;
      }

      setState({ phase: 'done', downloadUrl: result.downloadUrl, entryCount: result.entryCount });
    } catch (err) {
      setState({ phase: 'error', message: getErrorMessage(err, "L'export a échoué") });
    }
  }

  const submitting = state.phase === 'processing';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Exporter mes données</Text>

      <Text style={styles.label}>Format</Text>
      <View style={styles.segmented}>
        {(['csv', 'json'] as const).map((option) => (
          <Pressable
            key={option}
            style={[styles.segment, format === option && styles.segmentActive]}
            onPress={() => setFormat(option)}
          >
            <Text style={[styles.segmentText, format === option && styles.segmentTextActive]}>
              {option.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Tracker</Text>
      <View style={styles.pickerList}>
        <Pressable
          style={[styles.pickerRow, trackerId === null && styles.pickerRowActive]}
          onPress={() => setTrackerId(null)}
        >
          <Text style={[styles.pickerText, trackerId === null && styles.pickerTextActive]}>
            Tous les trackers
          </Text>
        </Pressable>
        {(trackers ?? []).map((t) => (
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

      <Text style={styles.label}>Du (AAAA-MM-JJ, optionnel)</Text>
      <TextInput
        style={styles.input}
        value={startDate}
        onChangeText={setStartDate}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Au (AAAA-MM-JJ, optionnel)</Text>
      <TextInput
        style={styles.input}
        value={endDate}
        onChangeText={setEndDate}
        autoCapitalize="none"
      />

      <Pressable
        style={styles.submitButton}
        onPress={() => void handleExport()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Exporter</Text>
        )}
      </Pressable>

      {state.phase === 'processing' && (
        <Text style={styles.hint}>
          Export volumineux en cours de traitement — cela peut prendre jusqu'à 60 secondes.
        </Text>
      )}
      {state.phase === 'empty' && (
        <Text style={styles.hint}>Aucune donnée ne correspond à ce filtre.</Text>
      )}
      {state.phase === 'error' && <Text style={styles.error}>{state.message}</Text>}
      {state.phase === 'done' && (
        <View style={styles.resultCard}>
          <Text style={styles.resultText}>{state.entryCount} entrées prêtes.</Text>
          <Pressable
            style={styles.downloadButton}
            onPress={() => void Linking.openURL(resolveDownloadUrl(state.downloadUrl))}
          >
            <Text style={styles.downloadButtonText}>Ouvrir / Télécharger</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
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
  pickerList: { gap: 8, maxHeight: 240 },
  pickerRow: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  pickerRowActive: { backgroundColor: '#111', borderColor: '#111' },
  pickerText: { fontSize: 14, color: '#111' },
  pickerTextActive: { color: '#fff', fontWeight: '600' },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  hint: { color: '#666', fontSize: 13, marginTop: 16, textAlign: 'center' },
  error: { color: '#dc2626', fontSize: 13, marginTop: 16, textAlign: 'center' },
  resultCard: { marginTop: 20, alignItems: 'center', gap: 12 },
  resultText: { fontSize: 14, color: '#444' },
  downloadButton: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  downloadButtonText: { color: '#111', fontWeight: '600' },
});
