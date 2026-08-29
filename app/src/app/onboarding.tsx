import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { APP_COLORS } from '../constants/theme';

export default function OnboardingScreen() {
  const { isDarkMode, setGuestName, setHasCompletedOnboarding } = useAppStore();
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = React.useMemo(() => getStyles(COLORS), [COLORS]);
  
  const [name, setName] = useState('');

  const handleContinue = async () => {
    const finalName = name.trim() || 'Explorer';
    await setGuestName(finalName);
    await setHasCompletedOnboarding(true);
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView 
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.content}>
          <Text style={s.title}>Welcome!</Text>
          <Text style={s.subtitle}>What should we call you?</Text>
          
          <TextInput
            style={s.input}
            placeholder="Your name"
            placeholderTextColor={COLORS.warmgray}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />
          
          <TouchableOpacity 
            style={[s.button, { opacity: name.trim().length > 0 ? 1 : 0.7 }]} 
            onPress={handleContinue}
          >
            <Text style={s.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 42,
    color: COLORS.charcoal,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    color: COLORS.warmgray,
    marginBottom: 48,
  },
  input: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.bone,
    fontFamily: 'Outfit_500Medium',
    fontSize: 24,
    color: COLORS.charcoal,
    paddingVertical: 12,
    marginBottom: 48,
  },
  button: {
    backgroundColor: COLORS.charcoal,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: COLORS.bg,
  },
});
