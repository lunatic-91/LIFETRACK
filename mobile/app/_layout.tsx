import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';

import { queryClient } from '../src/lib/queryClient';

export default function RootLayout(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trackers" options={{ headerShown: true }} />
        <Stack.Screen name="goals" options={{ headerShown: true }} />
      </Stack>
    </QueryClientProvider>
  );
}
