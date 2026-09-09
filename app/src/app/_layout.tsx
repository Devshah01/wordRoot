import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { LogBox, Platform, View, StyleSheet, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { 
  useFonts, 
  Outfit_400Regular, 
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold 
} from '@expo-google-fonts/outfit';
import { 
  Inter_400Regular, 
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold 
} from '@expo-google-fonts/inter';
import { Geist_700Bold } from '@expo-google-fonts/geist';
import * as SplashScreen from 'expo-splash-screen';
import { useAppStore } from '../store/useAppStore';
import AnimatedSplashScreen from '../components/AnimatedSplashScreen';
import { useLocalNotifications, requestNotificationPermissions } from '../hooks/useLocalNotifications';
import { initSyncListener } from '../services/sync';

LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'CssInterop upgrade warning',
  '[Worklets] Tried to modify key `handlerTag` of an object',
]);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Geist_700Bold,
  });

  const checkFirstLaunch = useAppStore(state => state.checkFirstLaunch);
  const isDarkMode = useAppStore(state => state.isDarkMode);
  const hasCompletedOnboarding = useAppStore(state => state.hasCompletedOnboarding);
  const [isSplashAnimationComplete, setSplashAnimationComplete] = useState(false);

  // Local daily reminder notifications (offline — no server push)
  useLocalNotifications();

  const handleSplashFinish = useCallback(async () => {
    setSplashAnimationComplete(true);
    if (hasCompletedOnboarding) {
      await requestNotificationPermissions();
    }
  }, [hasCompletedOnboarding]);

  useEffect(() => {
    // Push pending sync queue when back online (logged-in users only)
    const unsubscribe = initSyncListener();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    checkFirstLaunch();
  }, [checkFirstLaunch]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: isDarkMode ? '#121212' : '#FBFBFA' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: isDarkMode ? '#121212' : '#FBFBFA' }}>
      <StatusBar 
        barStyle={isDarkMode ? 'light-content' : 'dark-content'} 
        backgroundColor="transparent" 
        translucent={true} 
      />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)/login" options={{ presentation: 'modal' }} />
      </Stack>

      {!isSplashAnimationComplete && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>
          <AnimatedSplashScreen onAnimationFinish={handleSplashFinish} />
        </View>
      )}
    </GestureHandlerRootView>
  );
}
