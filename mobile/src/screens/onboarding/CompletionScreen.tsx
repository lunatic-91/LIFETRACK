import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useOnboarding } from '../../lib/onboardingContext';

/**
 * Requirements: 11.4
 */
export default function CompletionScreen() {
  const router = useRouter();
  const { createdTrackers } = useOnboarding();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>C'est parti !</Text>
      <Text style={styles.subtitle}>
        {createdTrackers.length > 0
          ? `${createdTrackers.length} tracker${createdTrackers.length > 1 ? 's ont' : ' a'} été créé${createdTrackers.length > 1 ? 's' : ''}.`
          : 'Vous pourrez créer vos trackers à tout moment depuis le tableau de bord.'}
      </Text>

      <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.primaryButtonText}>Voir mon tableau de bord</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji: { fontSize: 48 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 16 },
  primaryButton: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
