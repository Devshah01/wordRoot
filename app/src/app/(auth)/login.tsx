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
import { Mail, User, Globe, ArrowLeft, KeyRound, RefreshCw } from 'lucide-react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { performCloudSync } from '../../services/sync';
import { APP_COLORS } from '../../constants/theme';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
});

export default function AuthScreen() {
  const { setAuth, loadLocalDatabase, draftVocabLines, resetDraftVocabLines, isDarkMode } = useAppStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 2-Step OTP State: 'request' | 'verify'
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = useMemo(() => getStyles(COLORS, isDarkMode), [COLORS, isDarkMode]);

  // Resend Timer Countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const runPostAuthSync = useCallback(() => {
    performCloudSync({
      draftVocabLines,
      clearDrafts: resetDraftVocabLines,
    })
      .then(() => loadLocalDatabase())
      .catch((e) => console.warn('Background cloud sync failed', e));
  }, [draftVocabLines, loadLocalDatabase, resetDraftVocabLines]);

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

  // Step 1: Send OTP to Email
  const handleRequestOtp = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedEmail) {
      setErrorMsg('Email address is required');
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
    }

    setLoading(true);
    try {
      await api.auth.sendOtp({
        email: trimmedEmail,
        username: isSignUp ? trimmedUsername : undefined,
        isSignUp,
      });
      setStep('verify');
      setResendTimer(30);
      setSuccessMsg(`We sent a 6-digit code to ${trimmedEmail}`);
    } catch (err: any) {
      // Fallback: If backend uses register/login directly or errors
      setErrorMsg(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP Code
  const handleVerifyOtp = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    const trimmedCode = otpCode.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    if (!trimmedCode) {
      setErrorMsg('Please enter the 6-digit verification code');
      return;
    }
    if (trimmedCode.length < 4) {
      setErrorMsg('Invalid verification code length');
      return;
    }

    setLoading(true);
    try {
      const response = await api.auth.verifyOtp({
        email: trimmedEmail,
        code: trimmedCode,
        username: isSignUp ? trimmedUsername : undefined,
        isSignUp,
      });
      await setAuth(response.token, response.user);
      router.replace('/(tabs)/dashboard');
      runPostAuthSync();
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid or expired verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      let idToken = userInfo.data?.idToken || (userInfo as any).idToken;

      if (!idToken) {
        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens?.idToken;
        } catch (tokenErr) {
          console.warn('GoogleSignin.getTokens fallback failed:', tokenErr);
        }
      }

      if (idToken) {
        handleGoogleToken(idToken);
      } else {
        setErrorMsg('Google Sign-In failed: Web Client ID is missing or invalid in your configuration.');
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled the login flow
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // operation in progress
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        style={s.keyboardView}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          <AnimatedPressable
            onPress={() => {
              if (step === 'verify') {
                setStep('request');
                setErrorMsg('');
                setSuccessMsg('');
              } else {
                router.replace('/(tabs)/dashboard');
              }
            }}
            style={s.backBtn}
          >
            <ArrowLeft size={20} color={COLORS.charcoal} />
          </AnimatedPressable>

          <View style={s.titleSection}>
            <Text style={s.welcomeText}>
              {step === 'verify' ? 'Verify Your Email' : 'Sync your vocabulary'}
            </Text>
            <View style={s.brandRow}>
              <Image
                source={require('../../../assets/images/icon.png')}
                style={s.brandLogo}
                resizeMode="contain"
              />
              <Text style={s.brandText}>WordRoot</Text>
            </View>
            <Text style={s.subtitle}>
              {step === 'verify'
                ? `Enter the 6-digit verification code sent to ${email.trim().toLowerCase()}`
                : isSignUp
                ? 'Create an account to back up and sync across devices. The app keeps working offline.'
                : 'Sign in to sync your words across devices. Daily use stays fully offline.'}
            </Text>
          </View>

          {errorMsg ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={s.successBox}>
              <Text style={s.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {step === 'request' ? (
            /* STEP 1: Request OTP Form */
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
                  placeholder="Email Address"
                  placeholderTextColor={COLORS.warmgray}
                  value={email}
                  onChangeText={setEmail}
                  style={s.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <AnimatedPressable
                onPress={handleRequestOtp}
                disabled={loading}
                style={s.primaryBtn}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                  <Text style={s.primaryBtnText}>
                    Get Verification Code
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
                    setSuccessMsg('');
                  }}
                >
                  <Text style={s.toggleLink}>
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </Text>
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            /* STEP 2: Verify OTP Form */
            <View style={s.form}>
              <View style={s.inputRow}>
                <KeyRound size={18} color={COLORS.warmgray} />
                <TextInput
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={COLORS.warmgray}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  style={[s.otpInput, !otpCode && s.otpInputPlaceholder]}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoFocus
                />
              </View>

              <AnimatedPressable
                onPress={handleVerifyOtp}
                disabled={loading}
                style={s.primaryBtn}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                  <Text style={s.primaryBtnText}>Verify & Continue</Text>
                )}
              </AnimatedPressable>

              <View style={s.resendRow}>
                {resendTimer > 0 ? (
                  <Text style={s.resendTimerText}>
                    Resend code in {resendTimer}s
                  </Text>
                ) : (
                  <AnimatedPressable
                    onPress={handleRequestOtp}
                    disabled={loading}
                    style={s.resendBtn}
                  >
                    <RefreshCw size={14} color={COLORS.charcoal} />
                    <Text style={s.resendBtnText}>Resend Code</Text>
                  </AnimatedPressable>
                )}

                <Text style={s.dotSeparator}>•</Text>

                <AnimatedPressable
                  onPress={() => {
                    setStep('request');
                    setOtpCode('');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                >
                  <Text style={s.changeEmailText}>Change Email</Text>
                </AnimatedPressable>
              </View>
            </View>
          )}
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
      paddingTop: 24,
      paddingBottom: 32,
      justifyContent: 'flex-start',
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
      marginBottom: 28,
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
    successBox: {
      backgroundColor: isDarkMode ? '#143823' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDarkMode ? '#166534' : '#BBF7D0',
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    successText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: isDarkMode ? '#86EFAC' : '#15803D',
    },
    form: {
      gap: 12,
      marginBottom: 24,
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
    otpInput: {
      flex: 1,
      fontFamily: 'Outfit_600SemiBold',
      fontSize: 18,
      letterSpacing: 4,
      color: COLORS.charcoal,
      padding: 0,
    },
    otpInputPlaceholder: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      letterSpacing: 0,
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
      marginTop: 8,
    },
    primaryBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: COLORS.bg,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 20,
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
      marginTop: 20,
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
    resendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 16,
    },
    resendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    resendBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: COLORS.charcoal,
    },
    resendTimerText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: COLORS.warmgray,
    },
    dotSeparator: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: COLORS.warmgray,
    },
    changeEmailText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: COLORS.warmgray,
      textDecorationLine: 'underline',
    },
  });

