import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAppStore } from '../store/useAppStore';

export default function Index() {
  const isLoading = useAppStore(state => state.isLoading);
  const hasCompletedOnboarding = useAppStore(state => state.hasCompletedOnboarding);
  const isAuthenticated = useAppStore(state => state.isAuthenticated);
  const guestName = useAppStore(state => state.guestName);
  const isDarkMode = useAppStore(state => state.isDarkMode);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: isDarkMode ? '#121212' : '#FBFBFA', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={isDarkMode ? '#FFFFFF' : '#1A1A1A'} />
      </View>
    );
  }

  if (!isAuthenticated && (!hasCompletedOnboarding || !guestName || guestName.trim() === '')) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}

