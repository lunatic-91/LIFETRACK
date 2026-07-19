import { Fragment } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import type { WeeklyTrendPoint } from '../lib/trends';

interface Props {
  points: WeeklyTrendPoint[];
  color: string;
  maxScale: number; // e.g. 10 for a 1-10 mood/energy scale
}

const CHART_HEIGHT = 120;
const BAR_WIDTH = 28;
const GAP = 10;

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getUTCDay()]!;
}

export default function WeeklyBarChart({ points, color, maxScale }: Props) {
  const width = points.length * (BAR_WIDTH + GAP);

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT + 24}>
        {points.map((point, i) => {
          const x = i * (BAR_WIDTH + GAP);
          const value = point.average ?? 0;
          const barHeight = Math.max(2, (value / maxScale) * CHART_HEIGHT);

          return (
            <Fragment key={point.date}>
              <Rect
                x={x}
                y={CHART_HEIGHT - barHeight}
                width={BAR_WIDTH}
                height={barHeight}
                rx={4}
                fill={point.average === null ? '#e5e5e5' : color}
              />
              <SvgText
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 16}
                fontSize={11}
                fill="#888"
                textAnchor="middle"
              >
                {dayLabel(point.date)}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
      {points.every((p) => p.average === null) && (
        <Text style={styles.empty}>Pas de données pour cette période</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: '#888', fontSize: 13, marginTop: 8 },
});
