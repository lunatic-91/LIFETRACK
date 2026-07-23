import { apiClient } from '../lib/api.client';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface TrendInsight {
  id: string;
  type: 'trend';
  trackerId: string;
  direction: TrendDirection;
  slope: number;
  generatedAt: string;
}

export interface CorrelationInsight {
  id: string;
  type: 'correlation';
  trackerIdA: string;
  trackerIdB: string;
  pearsonR: number;
  generatedAt: string;
}

export type Insight = TrendInsight | CorrelationInsight;

/** Requirements: 9.3 — the API already returns insights ordered by generatedAt DESC. */
export async function fetchInsights(): Promise<Insight[]> {
  const { data } = await apiClient.get<Insight[]>('/insights');
  return data;
}
