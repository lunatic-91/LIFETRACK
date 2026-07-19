export type ChartRange = '7d' | '30d' | '90d' | '12m';

export function rangeToDates(range: ChartRange, today: string): { start: string; end: string } {
  const days: Record<ChartRange, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (days[range] - 1));
  return { start: d.toISOString().slice(0, 10), end: today };
}

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Maps a values array onto normalized SVG coordinates within
 * [0, width] x [0, height], oldest entry first (left to right).
 */
export function scaleToChart(values: number[], width: number, height: number): ChartPoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  return values.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * height,
  }));
}
