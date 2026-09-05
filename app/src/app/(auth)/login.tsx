/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native';
import AnimatedPressable from '../../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Mail, Lock, User, Globe, ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { performCloudSync } from '../../services/sync';
import { APP_COLORS } from '../../constants/theme';

const GOOGLE_WEB_CLIENT_ID = '238664083379-64r2lft68p858gqrectk4uh1dhh0pbtc.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});


export default function AuthScreen() {
  const { setAuth, loadLocalDatabase, draftVocabLines, setDraftVocabLines, isDarkMode } = useAppStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = useMemo(() => getStyles(COLORS, isDarkMode), [COLORS, isDarkMode]);

  const runPostAuthSync = useCallback(() => {
    performCloudSync({
      draftVocabLines,
      clearDrafts: () =>
        setDraftVocabLines(Array(5).fill(null).map(() => ({ word: '', meaning: '' }))),
    })
      .then(() => loadLocalDatabase())
      .catch((e) => console.warn('Background cloud sync failed', e));
  }, [draftVocabLines, loadLocalDatabase, setDraftVocabLines]);

  const handleGoogleToken = useCallback(async (idToken?: string) => {
    if (!idToken || typeof idToken !== 'string') {
      setErrorMsg('Google Sign-In did not return a valid token. Please try again.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const result = await api.auth.google({ idToken });
      await setAuth(result.token, result.user);
      router.replace('/(tabs)/dashboard');
      runPostAuthSync();
    } catch (err: any) {
      setErrorMsg(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  }, [runPostAuthSync, setAuth]);

  const handleAuthAction = async () => {
    setErrorMsg('');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedEmail || !password.trim()) {
      setErrorMsg('Email and password are required');
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address');
      return;
    }
    if (isSignUp) {
      if (!trimmedUsername) {
        setErrorMsg('Username is required for sign up');
        return;
      }
      if (trimmedUsername.length < 2) {
        setErrorMsg('Username must be at least 2 characters');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long');
        return;
      }
    }

    setLoading(true);
    try {
      let response;
      if (isSignUp) {
        response = await api.auth.register({
          username: trimmedUsername,
          email: trimmedEmail,
          password,
        });
      } else {
        response = await api.auth.login({
          email: trimmedEmail,
          password,
        });
      }
      await setAuth(response.token, response.user);
      router.replace('/(tabs)/dashboard');
      runPostAuthSync();
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken;
      if (idToken) {
        handleGoogleToken(idToken);
      } else {
        setErrorMsg('Google Sign-In failed: No ID token received.');
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled the login flow
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // operation (e.g. sign in) is in progress already
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrorMsg('Play services not available or outdated');
      } else {
        setErrorMsg(error.message || 'Google Sign-In failed. Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.keyboardView}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AnimatedPressable
            onPress={() => router.replace('/(tabs)/dashboard')}
            style={s.backBtn}
          >
            <ArrowLeft size={20} color={COLORS.charcoal} />
          </AnimatedPressable>

          <View style={s.titleSection}>
            <Text style={s.welcomeText}>Sync your vocabulary</Text>
            <View style={s.brandRow}>
              <Image
                source={require('../../../assets/images/icon.png')}
                style={s.brandLogo}
                resizeMode="contain"
              />
              <Text style={s.brandText}>WordRoot</Text>
            </View>
            <Text style={s.subtitle}>
              {isSignUp
                ? 'Create an account to back up and sync across devices. The app keeps working offline.'
                : 'Sign in to sync your words across devices. Daily use stays fully offline.'}
            </Text>
          </View>

          {errorMsg ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={s.form}>
            {isSignUp && (
              <View style={s.inputRow}>
                <User size={18} color={COLORS.warmgray} />
                <TextInput
                  placeholder="User Name"
                  placeholderTextColor={COLORS.warmgray}
                  value={username}
                  onChangeText={setUsername}
                  style={s.input}
                  autoCapitalize="none"
                />
              </View>
            )}

            <View style={s.inputRow}>
              <Mail size={18} color={COLORS.warmgray} />
              <TextInput
                placeholder="Email"
                placeholderTextColor={COLORS.warmgray}
                value={email}
                onChangeText={setEmail}
                style={s.input}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={s.inputRow}>
              <Lock size={18} color={COLORS.warmgray} />
              <TextInput
                placeholder="Password"
                placeholderTextColor={COLORS.warmgray}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={s.input}
              />
              <AnimatedPressable onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={18} color={COLORS.warmgray} />
                ) : (
                  <Eye size={18} color={COLORS.warmgray} />
                )}
              </AnimatedPressable>
            </View>
          </View>

          {!isSignUp && (
            <AnimatedPressable
              onPress={() => router.push('/(auth)/forgot-password')}
              style={s.forgotRow}
            >
              <Text style={s.forgotText}>Forgot password?</Text>
            </AnimatedPressable>
          )}

          <AnimatedPressable
            onPress={handleAuthAction}
            disabled={loading}
            style={s.primaryBtn}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.bg} />
            ) : (
              <Text style={s.primaryBtnText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </AnimatedPressable>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          <AnimatedPressable
            onPress={handleGoogleAuth}
            disabled={loading}
            style={[s.googleBtn, loading && { opacity: 0.6 }]}
          >
            <Globe size={18} color={COLORS.charcoal} />
            <Text style={s.googleBtnText}>Continue with Google</Text>
          </AnimatedPressable>

          <View style={s.toggleRow}>
            <Text style={s.toggleText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <AnimatedPressable
              onPress={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
              }}
            >
              <Text style={s.toggleLink}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any, isDarkMode: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    keyboardView: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingVertical: 16,
      justifyContent: 'center',
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.lightgray,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 32,
    },
    titleSection: {
      marginBottom: 32,
    },
    welcomeText: {
      fontFamily: 'Outfit_400Regular',
      fontSize: 28,
      color: COLORS.charcoal,
    },
    brandRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: 8,
      gap: 8,
    },
    brandText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 28,
      color: COLORS.charcoal,
    },
    brandLogo: {
      width: 32,
      height: 32,
      borderRadius: 6,
    },
    subtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: COLORS.warmgray,
      lineHeight: 18,
    },
    errorBox: {
      backgroundColor: isDarkMode ? '#3B1818' : '#FEF2F2',
      borderWidth: 1,
      borderColor: isDarkMode ? '#7F1D1D' : '#FECACA',
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: isDarkMode ? '#FCA5A5' : '#DC2626',
    },
    form: {
      gap: 12,
      marginBottom: 24,
    },
    forgotRow: {
      alignSelf: 'flex-end' as const,
      marginTop: -16,
      marginBottom: 16,
    },
    forgotText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: COLORS.warmgray,
      textDecorationLine: 'underline' as const,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: COLORS.bone,
      gap: 12,
    },
    input: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: COLORS.charcoal,
      padding: 0,
    },
    primaryBtn: {
      backgroundColor: COLORS.charcoal,
      borderRadius: 24,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    primaryBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: COLORS.bg,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: COLORS.bone,
    },
    dividerText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: COLORS.warmgray,
      marginHorizontal: 16,
      textTransform: 'lowercase',
    },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: COLORS.charcoal,
      backgroundColor: isDarkMode ? COLORS.card : 'transparent',
      borderRadius: 24,
      paddingVertical: 14,
      gap: 8,
    },
    googleBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: COLORS.charcoal,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 24,
    },
    toggleText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: COLORS.warmgray,
    },
    toggleLink: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: COLORS.charcoal,
      textDecorationLine: 'underline',
    },
  });
