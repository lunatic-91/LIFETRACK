import { View, Text, StyleSheet } from 'react-native';

export default function ExportScreen(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Export</Text>
      <Text style={styles.subtitle}>À implémenter</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { color: '#888' },
});
