import { Stack } from 'expo-router';

import { OnboardingProvider } from '../../src/lib/onboardingContext';

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingProvider>
  );
}
