import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native';
import AnimatedPressable from '../../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Mail, Lock, KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { APP_COLORS } from '../../constants/theme';

type Step = 'email' | 'code' | 'newPassword' | 'success';

export default function ForgotPasswordScreen() {
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = useMemo(() => getStyles(COLORS, isDarkMode), [COLORS, isDarkMode]);

  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRequestCode = async () => {
    setErrorMsg('');
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedEmail) {
      setErrorMsg('Email is required');
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const response = await api.auth.forgotPassword({ email: trimmedEmail });
      if (response && response.resetCode) {
        // Alert the reset code for development/testing purposes
        alert(`Test Reset Code: ${response.resetCode}`);
      }
      setStep('code');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setErrorMsg('');
    if (!code.trim() || code.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit code');
      return;
    }
    setStep('newPassword');
  };

  const handleResetPassword = async () => {
    setErrorMsg('');
    if (!newPassword.trim()) {
      setErrorMsg('New password is required');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.auth.resetPassword({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword,
      });
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'email': return 'Reset Password';
      case 'code': return 'Enter Code';
      case 'newPassword': return 'New Password';
      case 'success': return 'All Done!';
    }
  };

  const getStepSubtitle = () => {
    switch (step) {
      case 'email': return 'Enter your email address and we\'ll send you a code to reset your password.';
      case 'code': return `We've sent a 6-digit code to ${email.trim().toLowerCase()}. Enter it below.`;
      case 'newPassword': return 'Choose a strong new password for your account.';
      case 'success': return 'Your password has been reset successfully. You can now sign in with your new password.';
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
            onPress={() => {
              if (step === 'code') setStep('email');
              else if (step === 'newPassword') setStep('code');
              else router.back();
            }}
            style={s.backBtn}
          >
            <ArrowLeft size={20} color={COLORS.charcoal} />
          </AnimatedPressable>

          <View style={s.titleSection}>
            <Text style={s.titleText}>{getStepTitle()}</Text>
            <Text style={s.subtitle}>{getStepSubtitle()}</Text>
          </View>

          {/* Step indicator */}
          {step !== 'success' && (
            <View style={s.stepRow}>
              {['email', 'code', 'newPassword'].map((s_step, i) => (
                <View
                  key={s_step}
                  style={[
                    s.stepDot,
                    {
                      backgroundColor:
                        step === s_step
                          ? COLORS.charcoal
                          : ['email', 'code', 'newPassword'].indexOf(step) > i
                            ? COLORS.charcoal
                            : COLORS.bone,
                      opacity: step === s_step ? 1 : ['email', 'code', 'newPassword'].indexOf(step) > i ? 0.4 : 0.3,
                    },
                  ]}
                />
              ))}
            </View>
          )}

          {errorMsg ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Step: Email */}
          {step === 'email' && (
            <View style={s.form}>
              <View style={s.inputRow}>
                <Mail size={18} color={COLORS.warmgray} />
                <TextInput
                  placeholder="Email address"
                  placeholderTextColor={COLORS.warmgray}
                  value={email}
                  onChangeText={setEmail}
                  style={s.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
              </View>

              <AnimatedPressable
                onPress={handleRequestCode}
                disabled={loading}
                style={s.primaryBtn}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                  <Text style={s.primaryBtnText}>Send Reset Code</Text>
                )}
              </AnimatedPressable>
            </View>
          )}

          {/* Step: Code */}
          {step === 'code' && (
            <View style={s.form}>
              <View style={s.inputRow}>
                <KeyRound size={18} color={COLORS.warmgray} />
                <TextInput
                  placeholder="6-digit code"
                  placeholderTextColor={COLORS.warmgray}
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  style={s.input}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              <AnimatedPressable
                onPress={handleVerifyCode}
                disabled={loading}
                style={s.primaryBtn}
              >
                <Text style={s.primaryBtnText}>Verify Code</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={handleRequestCode}
                disabled={loading}
                style={s.secondaryBtn}
              >
                <Text style={s.secondaryBtnText}>
                  {loading ? 'Sending…' : 'Resend Code'}
                </Text>
              </AnimatedPressable>
            </View>
          )}

          {/* Step: New Password */}
          {step === 'newPassword' && (
            <View style={s.form}>
              <View style={s.inputRow}>
                <Lock size={18} color={COLORS.warmgray} />
                <TextInput
                  placeholder="New password"
                  placeholderTextColor={COLORS.warmgray}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  style={s.input}
                  autoFocus
                />
                <AnimatedPressable onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={18} color={COLORS.warmgray} />
                  ) : (
                    <Eye size={18} color={COLORS.warmgray} />
                  )}
                </AnimatedPressable>
              </View>

              <View style={s.inputRow}>
                <Lock size={18} color={COLORS.warmgray} />
                <TextInput
                  placeholder="Confirm new password"
                  placeholderTextColor={COLORS.warmgray}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  style={s.input}
                />
                <AnimatedPressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? (
                    <EyeOff size={18} color={COLORS.warmgray} />
                  ) : (
                    <Eye size={18} color={COLORS.warmgray} />
                  )}
                </AnimatedPressable>
              </View>

              <AnimatedPressable
                onPress={handleResetPassword}
                disabled={loading}
                style={s.primaryBtn}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                  <Text style={s.primaryBtnText}>Reset Password</Text>
                )}
              </AnimatedPressable>
            </View>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <View style={s.successSection}>
              <View style={s.successIcon}>
                <CheckCircle2 size={48} color={COLORS.charcoal} strokeWidth={1.5} />
              </View>

              <AnimatedPressable
                onPress={() => router.replace('/(auth)/login')}
                style={s.primaryBtn}
              >
                <Text style={s.primaryBtnText}>Back to Sign In</Text>
              </AnimatedPressable>
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
      paddingVertical: 16,
      justifyContent: 'center',
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: COLORS.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: COLORS.bone,
      marginBottom: 32,
    },
    titleSection: {
      marginBottom: 24,
    },
    titleText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 28,
      color: COLORS.charcoal,
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: COLORS.warmgray,
      lineHeight: 18,
    },
    stepRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 24,
    },
    stepDot: {
      width: 32,
      height: 4,
      borderRadius: 2,
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
      marginTop: 8,
    },
    primaryBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: COLORS.bg,
    },
    secondaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    secondaryBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: COLORS.warmgray,
      textDecorationLine: 'underline',
    },
    successSection: {
      alignItems: 'center',
      gap: 24,
    },
    successIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.bone,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
  });
