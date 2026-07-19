export interface DailyEntry {
  localDate: string; // YYYY-MM-DD
  value: number;
}

export interface WeeklyTrendPoint {
  date: string; // YYYY-MM-DD
  average: number | null; // null = no Entry that day (placeholder)
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateOnly(d);
}

/**
 * Computes the arithmetic mean of Entry values per local calendar day for
 * the 7 days ending on `today` (inclusive). Days with no Entries get
 * `average: null` so the UI can render a zero bar or a placeholder dash,
 * per Req 7.4 / 7.6 ("using zero or a visual placeholder").
 *
 * Requirements: 7.4, 7.6
 */
export function computeWeeklyTrend(entries: DailyEntry[], today: string): WeeklyTrendPoint[] {
  const byDate = new Map<string, number[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.localDate) ?? [];
    list.push(entry.value);
    byDate.set(entry.localDate, list);
  }

  const startDate = addDays(today, -6);
  const points: WeeklyTrendPoint[] = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i);
    const values = byDate.get(date);
    const average =
      values && values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    points.push({ date, average });
  }

  return points;
}
