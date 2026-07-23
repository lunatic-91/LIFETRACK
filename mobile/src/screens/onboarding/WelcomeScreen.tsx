import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Requirements: 11.1, 11.5
 */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>👋</Text>
      <Text style={styles.title}>Bienvenue sur LifeTrack</Text>
      <Text style={styles.subtitle}>
        Suivez vos habitudes, votre humeur et vos objectifs au même endroit. Configurons
        ensemble vos premiers trackers.
      </Text>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/(onboarding)/templates')}>
        <Text style={styles.primaryButtonText}>Commencer</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.skip}>Passer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji: { fontSize: 48 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 16 },
  primaryButton: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  skip: { color: '#888', marginTop: 16, fontSize: 14 },
});
