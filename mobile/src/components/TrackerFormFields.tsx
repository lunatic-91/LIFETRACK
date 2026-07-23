import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';

export interface TrackerFormValues {
  name: string;
  unit: string;
  frequencyType: 'daily' | 'weekly' | 'custom';
  intervalDays: string;
  validRangeEnabled: boolean;
  validMin: string;
  validMax: string;
  isHabit: boolean;
  graceEnabled: boolean;
}

export function defaultTrackerFormValues(): TrackerFormValues {
  return {
    name: '',
    unit: '',
    frequencyType: 'daily',
    intervalDays: '2',
    validRangeEnabled: false,
    validMin: '',
    validMax: '',
    isHabit: false,
    graceEnabled: false,
  };
}

/** Converts form state into the API's `frequency` shape. Returns `null` for an invalid custom interval. */
export function frequencyFromForm(
  values: Pick<TrackerFormValues, 'frequencyType' | 'intervalDays'>,
): 'daily' | 'weekly' | { intervalDays: number } | null {
  if (values.frequencyType === 'daily') return 'daily';
  if (values.frequencyType === 'weekly') return 'weekly';

  const intervalDays = Number(values.intervalDays);
  if (!Number.isInteger(intervalDays) || intervalDays < 1) return null;
  return { intervalDays };
}

/** Converts form state into the API's `validRange` shape. Returns `undefined` when disabled, `null` when invalid. */
export function validRangeFromForm(
  values: Pick<TrackerFormValues, 'validRangeEnabled' | 'validMin' | 'validMax'>,
): { min: number; max: number } | undefined | null {
  if (!values.validRangeEnabled) return undefined;

  const min = Number(values.validMin);
  const max = Number(values.validMax);
  if (
    values.validMin === '' ||
    values.validMax === '' ||
    Number.isNaN(min) ||
    Number.isNaN(max) ||
    min >= max
  ) {
    return null;
  }
  return { min, max };
}

interface Props {
  values: TrackerFormValues;
  onChange: (values: TrackerFormValues) => void;
  fieldErrors: Record<string, string>;
}

/**
 * Requirements: 2.1, 2.3
 */
export default function TrackerFormFields({ values, onChange, fieldErrors }: Props): JSX.Element {
  function set<K extends keyof TrackerFormValues>(key: K, value: TrackerFormValues[K]): void {
    onChange({ ...values, [key]: value });
  }

  return (
    <View style={styles.group}>
      <Text style={styles.label}>Nom</Text>
      <TextInput
        style={styles.input}
        value={values.name}
        onChangeText={(v) => set('name', v)}
        placeholder="ex. Méditation"
        maxLength={100}
      />
      {fieldErrors['name'] && <Text style={styles.error}>{fieldErrors['name']}</Text>}

      <Text style={styles.label}>Unité (optionnel)</Text>
      <TextInput
        style={styles.input}
        value={values.unit}
        onChangeText={(v) => set('unit', v)}
        placeholder="ex. minutes"
      />
      {fieldErrors['unit'] && <Text style={styles.error}>{fieldErrors['unit']}</Text>}

      <Text style={styles.label}>Fréquence</Text>
      <View style={styles.segmented}>
        {(['daily', 'weekly', 'custom'] as const).map((option) => (
          <Pressable
            key={option}
            style={[styles.segment, values.frequencyType === option && styles.segmentActive]}
            onPress={() => set('frequencyType', option)}
          >
            <Text
              style={[
                styles.segmentText,
                values.frequencyType === option && styles.segmentTextActive,
              ]}
            >
              {option === 'daily' ? 'Quotidien' : option === 'weekly' ? 'Hebdo' : 'Personnalisé'}
            </Text>
          </Pressable>
        ))}
      </View>
      {values.frequencyType === 'custom' && (
        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabel}>Tous les</Text>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            value={values.intervalDays}
            onChangeText={(v) => set('intervalDays', v)}
            keyboardType="number-pad"
          />
          <Text style={styles.inlineLabel}>jours</Text>
        </View>
      )}
      {fieldErrors['frequency'] && <Text style={styles.error}>{fieldErrors['frequency']}</Text>}

      <View style={styles.switchRow}>
        <Text style={styles.label}>Plage de valeurs valides</Text>
        <Switch
          value={values.validRangeEnabled}
          onValueChange={(v) => set('validRangeEnabled', v)}
        />
      </View>
      {values.validRangeEnabled && (
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            value={values.validMin}
            onChangeText={(v) => set('validMin', v)}
            placeholder="min"
            keyboardType="numeric"
          />
          <Text style={styles.inlineLabel}>à</Text>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            value={values.validMax}
            onChangeText={(v) => set('validMax', v)}
            placeholder="max"
            keyboardType="numeric"
          />
        </View>
      )}
      {fieldErrors['validRange'] && <Text style={styles.error}>{fieldErrors['validRange']}</Text>}

      <View style={styles.switchRow}>
        <Text style={styles.label}>Habitude (suivi de série)</Text>
        <Switch value={values.isHabit} onValueChange={(v) => set('isHabit', v)} />
      </View>

      {values.isHabit && (
        <View style={styles.switchRow}>
          <Text style={styles.label}>Jour de grâce (1 jour manqué toléré/semaine)</Text>
          <Switch value={values.graceEnabled} onValueChange={(v) => set('graceEnabled', v)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  error: { color: '#dc2626', fontSize: 13, marginTop: 4 },
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
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  inlineLabel: { fontSize: 14, color: '#444' },
  inlineInput: { flex: 1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
});
