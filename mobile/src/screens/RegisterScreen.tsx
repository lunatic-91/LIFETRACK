import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Link } from 'expo-router';
import type { AxiosError } from 'axios';

import { apiClient } from '../lib/api.client';
import { saveSession } from '../lib/session';

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function RegisterScreen(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  async function handleRegister(): Promise<void> {
    setErrors({});
    setLoading(true);
    try {
      const { data } = await apiClient.post('/auth/register', { email, password });
      await saveSession(data);
      router.replace('/(tabs)');
    } catch (err) {
      const axiosErr = err as AxiosError<{ fields?: FieldErrors; message?: string }>;
      const fields = axiosErr.response?.data?.fields;
      if (fields) {
        setErrors(fields);
      } else {
        setErrors({ email: axiosErr.response?.data?.message ?? 'Registration failed' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un compte</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {errors.email && <Text style={styles.error}>{errors.email}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Mot de passe (8-128 caractères)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {errors.password && <Text style={styles.error}>{errors.password}</Text>}

      <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>S'inscrire</Text>}
      </Pressable>

      <Link href="/(auth)/login" style={styles.link}>
        <Text>Déjà un compte ? Se connecter</Text>
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
  link: { marginTop: 16, alignSelf: 'center' },
});
