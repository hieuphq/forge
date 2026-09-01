import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { getUserMessage } from '@yourorg/shared';

// Real runtime import from the workspace package, not type-only — this is
// the proof that Metro resolves `packages/shared` through the symlinked
// workspace, not just that TypeScript can see its types.
const sharedMessage = getUserMessage('common/NOT_FOUND');

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <Text testID="shared-package-message">{sharedMessage}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
