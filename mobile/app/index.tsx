import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';

import { hasActiveSession } from '../src/lib/session';
import { fetchTrackers } from '../src/api/trackers';

type Destination = '/(tabs)' | '/(auth)/login' | '/(onboarding)/welcome';

/**
 * Requirements: 11.1
 */
export default function Index() {
  const [checking, setChecking] = useState(true);
  const [destination, setDestination] = useState<Destination>('/(auth)/login');

  useEffect(() => {
    async function resolveDestination(): Promise<void> {
      const authenticated = await hasActiveSession();
      if (!authenticated) {
        setDestination('/(auth)/login');
        return;
      }

      try {
        const trackers = await fetchTrackers();
        // No Trackers yet = first login -> onboarding (Req 11.1).
        setDestination(trackers.length === 0 ? '/(onboarding)/welcome' : '/(tabs)');
      } catch {
        // If the trackers check fails (e.g. transient network issue), fail
        // open to the Dashboard rather than blocking the user on the splash.
        setDestination('/(tabs)');
      }
    }

    resolveDestination().finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={destination} />;
}
