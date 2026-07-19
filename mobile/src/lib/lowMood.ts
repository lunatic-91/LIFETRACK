export const LOW_MOOD_THRESHOLD = 3;

/**
 * Requirements: 7.5
 */
export function isLowMood(value: number): boolean {
  return value <= LOW_MOOD_THRESHOLD;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Kept to <=50 words (Req 7.5 / Property 13).
export const LOW_MOOD_MESSAGE =
  "It looks like today has been tough. That's okay — difficult days happen, " +
  'and reaching out for support is a sign of strength, not weakness. ' +
  'You deserve care, and help is available whenever you need it.';

export const LOW_MOOD_RESOURCE_LABEL = 'Find well-being resources';
export const LOW_MOOD_RESOURCE_URL = 'https://988lifeline.org';
