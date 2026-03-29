import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { offlineService } from '@/services/offlineService';
import { connectivityService } from '@/services/connectivityService';

export default function RootLayout() {
  useEffect(() => {
    offlineService.initDatabase();
    connectivityService.start();
    return () => connectivityService.stop();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="automacao" options={{ animation: 'ios_from_right' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
