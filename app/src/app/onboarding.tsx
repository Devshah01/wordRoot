/* eslint-disable react/no-unescaped-entities */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { User, Sparkles, ArrowRight, X } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { APP_COLORS } from '../constants/theme';

export default function OnboardingScreen() {
  const { isDarkMode, setGuestName, setHasCompletedOnboarding } = useAppStore();
  const insets = useSafeAreaInsets();
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = useMemo(() => getStyles(COLORS, isDarkMode), [COLORS, isDarkMode]);

  const [name, setName] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const placeholderColor = isDarkMode ? '#666666' : '#B8B4AE';

  const handleContinue = async () => {
    const finalName = name.trim() || 'Explorer';
    await setGuestName(finalName);
    await setHasCompletedOnboarding(true);
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            s.scrollContent,
            {
              paddingTop: Math.max(insets.top, 16) + 12,
              paddingBottom: Math.max(insets.bottom, 20) + 16,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Brand Header */}
          <View style={s.headerSection}>
            <View style={s.brandBadge}>
              <Sparkles size={24} color={COLORS.charcoal} strokeWidth={2} />
            </View>
            <Text style={s.eyebrow}>WELCOME TO WORDROOT</Text>
            <Text style={s.title}>What should we{'\n'}call you?</Text>
            <Text style={s.subtitle}>
              Personalize your daily vocabulary journey. You can change this anytime in your profile.
            </Text>
          </View>

          {/* Main Card */}
          <View style={s.card}>
            <Text style={s.inputLabel}>YOUR NAME OR NICKNAME</Text>

            <View style={[s.inputRow, isFocused && s.inputRowFocused]}>
              <User
                size={20}
                color={isFocused ? COLORS.charcoal : COLORS.warmgray}
                strokeWidth={isFocused ? 2.2 : 1.8}
              />
              <TextInput
                style={s.input}
                placeholder="Alex"
                placeholderTextColor={placeholderColor}
                value={name}
                onChangeText={setName}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                maxLength={30}
              />
              {name.trim().length > 0 && (
                <AnimatedPressable
                  onPress={() => setName('')}
                  style={s.clearBtn}
                  activeOpacity={0.7}
                >
                  <X size={16} color={COLORS.warmgray} />
                </AnimatedPressable>
              )}
            </View>

            {/* Primary Action Button */}
            <AnimatedPressable
              style={s.continueBtn}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <Text style={s.continueBtnText}>Continue</Text>
              <ArrowRight size={18} color={COLORS.bg} strokeWidth={2.5} />
            </AnimatedPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any, isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.bg,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },

    // Header Section
    headerSection: {
      marginBottom: 24,
    },
    brandBadge: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.bone,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    eyebrow: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: COLORS.warmgray,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    title: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 32,
      color: COLORS.charcoal,
      lineHeight: 40,
      marginBottom: 10,
    },
    subtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: COLORS.warmgray,
      lineHeight: 22,
    },

    // Main Card
    card: {
      backgroundColor: COLORS.white,
      borderRadius: 24,
      padding: 22,
      borderWidth: 1,
      borderColor: COLORS.bone,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDarkMode ? 0.2 : 0.06,
      shadowRadius: 16,
      elevation: 4,
      marginBottom: 24,
    },
    inputLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: COLORS.warmgray,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: COLORS.bone,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      marginBottom: 20,
    },
    inputRowFocused: {
      borderColor: COLORS.charcoal,
      backgroundColor: COLORS.white,
    },
    input: {
      flex: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 16,
      color: COLORS.charcoal,
      padding: 0,
    },
    clearBtn: {
      padding: 4,
      borderRadius: 12,
      backgroundColor: COLORS.bone,
    },

    // Continue Button
    continueBtn: {
      backgroundColor: COLORS.charcoal,
      borderRadius: 22,
      paddingVertical: 16,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 3,
    },
    continueBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: COLORS.bg,
    },
  });
