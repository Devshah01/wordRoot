import { Redirect } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

export default function Index() {
  const isLoading = useAppStore(state => state.isLoading);
  const hasCompletedOnboarding = useAppStore(state => state.hasCompletedOnboarding);
  const isAuthenticated = useAppStore(state => state.isAuthenticated);

  if (isLoading) {
    return null;
  }

  if (!hasCompletedOnboarding && !isAuthenticated) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}

