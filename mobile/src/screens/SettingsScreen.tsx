import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Requirements: 2.1
 */
export default function SettingsScreen(): JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Pressable style={styles.row} onPress={() => router.push('/trackers')}>
        <Text style={styles.rowText}>Mes trackers</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/(onboarding)/welcome')}>
        <Text style={styles.rowText}>Relancer l'onboarding</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 16,
  },
  rowText: { fontSize: 16, fontWeight: '500' },
  chevron: { fontSize: 20, color: '#999' },
});
