import { createContext, useContext, useState, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { Tracker } from '../api/trackers';

interface OnboardingContextValue {
  selectedTemplateIds: string[];
  setSelectedTemplateIds: (ids: string[]) => void;
  createdTrackers: Tracker[];
  setCreatedTrackers: (trackers: Tracker[]) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [createdTrackers, setCreatedTrackers] = useState<Tracker[]>([]);

  const value = useMemo(
    () => ({ selectedTemplateIds, setSelectedTemplateIds, createdTrackers, setCreatedTrackers }),
    [selectedTemplateIds, createdTrackers],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
