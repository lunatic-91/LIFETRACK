import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { isLowMood, LOW_MOOD_MESSAGE, LOW_MOOD_RESOURCE_LABEL, LOW_MOOD_RESOURCE_URL } from '../lib/lowMood';

interface Props {
  moodValue: number;
}

/**
 * Requirements: 7.5
 */
export default function LowMoodBanner({ moodValue }: Props) {
  if (!isLowMood(moodValue)) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.message}>{LOW_MOOD_MESSAGE}</Text>
      <Pressable onPress={() => Linking.openURL(LOW_MOOD_RESOURCE_URL)}>
        <Text style={styles.link}>{LOW_MOOD_RESOURCE_LABEL}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  message: { fontSize: 14, color: '#78350f', lineHeight: 20 },
  link: { fontSize: 14, fontWeight: '600', color: '#92400e', textDecorationLine: 'underline' },
});
