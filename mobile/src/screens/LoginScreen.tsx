import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Link } from 'expo-router';
import type { AxiosError } from 'axios';

import { apiClient } from '../lib/api.client';
import { saveSession } from '../lib/session';

export default function LoginScreen(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      await saveSession(data);
      router.replace('/(tabs)');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      // Auth_Service intentionally returns a generic message (Req 1.5) —
      // surfaced as-is, never split into "email" vs "password" fields.
      setError(axiosErr.response?.data?.message ?? 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connexion</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Se connecter</Text>}
      </Pressable>

      <Link href="/(auth)/forgot-password" style={styles.link}>
        <Text>Mot de passe oublié ?</Text>
      </Link>
      <Link href="/(auth)/register" style={styles.link}>
        <Text>Créer un compte</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  error: { color: '#dc2626', fontSize: 13 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { marginTop: 12, alignSelf: 'center' },
});
