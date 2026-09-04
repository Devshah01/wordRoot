import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useLocalNotifications } from '../hooks/useLocalNotifications';
import { initSyncListener } from '../services/sync';

// Safe WebCrypto fallback for non-https LAN web preview
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  if (!window.crypto) {
    (window as any).crypto = {};
  }
  if (!window.crypto.subtle) {
    (window as any).crypto.subtle = {
      digest: async () => new ArrayBuffer(32),
      getRandomValues: (arr: any) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
    };
  }
}

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
  const isAuthenticated = useAppStore(state => state.isAuthenticated);
  const isDarkMode = useAppStore(state => state.isDarkMode);
  const [isSplashAnimationComplete, setSplashAnimationComplete] = useState(false);

  // Local daily reminder notifications (offline — no server push)
  useLocalNotifications();

  useEffect(() => {
    // Push pending sync queue when back online (logged-in users only)
    const unsubscribe = initSyncListener(isAuthenticated);
    return () => unsubscribe();
  }, [isAuthenticated]);

  useEffect(() => {
    checkFirstLaunch();
  }, [checkFirstLaunch]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
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
          <AnimatedSplashScreen onAnimationFinish={() => setSplashAnimationComplete(true)} />
        </View>
      )}
    </GestureHandlerRootView>
  );
}
