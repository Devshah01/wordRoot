/* eslint-disable react/no-unescaped-entities */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import AnimatedPressable from '../../components/AnimatedPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { CheckCircle2, ChevronLeft, XCircle, Sparkles, BookOpen, ArrowRight, Play } from 'lucide-react-native';
import { useAppStore, Word } from '../../store/useAppStore';
import { calculateNextFSRSState } from '../../services/fsrs';
import { saveWord, getWords } from '../../db/queries';
import { computePendingReviewGroups, PendingReviewGroup, formatLocalDateString } from '../../services/localData';
import { queueCloudChange } from '../../services/sync';
import { APP_COLORS } from '../../constants/theme';

export default function ReviewScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { isDarkMode, setIsTabBarHidden, loadLocalDatabase } = useAppStore();
  const insets = useSafeAreaInsets();

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = useMemo(() => getStyles(COLORS), [COLORS]);

  const [loading, setLoading] = useState(true);
  const [pendingGroups, setPendingGroups] = useState<PendingReviewGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PendingReviewGroup | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Active review session state
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const flipRotation = useSharedValue(0);

  const loadPendingData = useCallback(async () => {
    setLoading(true);
    try {
      await loadLocalDatabase();
      const localWords = await getWords();
      const groups = computePendingReviewGroups(localWords);
      setPendingGroups(groups);

      if (groups.length > 0) {
        if (date) {
          const matched = groups.find((g) => g.date === date);
          setSelectedGroup(matched || groups[0]);
        } else {
          setSelectedGroup(groups[0]);
        }
      } else {
        setSelectedGroup(null);
      }
    } catch (e) {
      console.error('Failed to load pending reviews', e);
    } finally {
      setLoading(false);
    }
  }, [date, loadLocalDatabase]);

  useFocusEffect(
    useCallback(() => {
      // Whenever the screen gains focus, reset session and reload groups
      setIsSessionActive(false);
      setIsTabBarHidden(false);
      loadPendingData();

      return () => {
        setIsTabBarHidden(false);
        loadLocalDatabase();
      };
    }, [loadPendingData, setIsTabBarHidden, loadLocalDatabase])
  );

  // Hide tab bar only while actively reviewing cards
  useEffect(() => {
    if (isSessionActive && sessionWords.length > 0 && currentIndex < sessionWords.length) {
      setIsTabBarHidden(true);
    } else {
      setIsTabBarHidden(false);
    }
  }, [isSessionActive, sessionWords.length, currentIndex, setIsTabBarHidden]);

  const handleStartReview = (groupToStart?: PendingReviewGroup) => {
    const group = groupToStart || selectedGroup;
    if (!group || group.words.length === 0) return;

    setSessionWords(group.words);
    setCurrentIndex(0);
    setIsFlipped(false);
    flipRotation.value = 0;
    setIsSessionActive(true);
  };

  const handleExitSession = () => {
    setIsSessionActive(false);
    setIsTabBarHidden(false);
    loadPendingData();
  };

  const handleCardFlip = () => {
    if (isFlipped) {
      flipRotation.value = withTiming(0, { duration: 400 });
      setIsFlipped(false);
    } else {
      flipRotation.value = withTiming(180, { duration: 400 });
      setIsFlipped(true);
    }
  };

  const handleFSRSResponse = async (rating: 'remember' | 'forgot') => {
    const activeCard = sessionWords[currentIndex];
    if (!activeCard) return;

    // 1. Calculate new FSRS state instantly
    const updatedWord = calculateNextFSRSState(activeCard, rating);

    // 2. Update local state
    try {
      await saveWord(updatedWord);
      await queueCloudChange(updatedWord.id, 'review', { rating, updatedWord });

      const newSessionWords = [...sessionWords];
      newSessionWords[currentIndex] = updatedWord;
      setSessionWords(newSessionWords);
    } catch (e) {
      console.error('Failed to save offline review', e);
    }

    if (currentIndex < sessionWords.length - 1) {
      flipRotation.value = withTiming(0, { duration: 200 });
      setTimeout(() => {
        setIsFlipped(false);
        setCurrentIndex((prev) => prev + 1);
      }, 250);
    } else {
      setCurrentIndex((prev) => prev + 1);
      loadLocalDatabase();
    }
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateValue = interpolate(flipRotation.value, [0, 180], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateValue}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateValue = interpolate(flipRotation.value, [0, 180], [180, 360]);
    return {
      transform: [{ rotateY: `${rotateValue}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
  });

  const formatDateDisplay = (dateInput: string | Date) => {
    if (!dateInput) return '';
    const dateStr = formatLocalDateString(dateInput);
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[month - 1] || ''} ${year}`;
    }
    return dateStr;
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, s.center]} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.charcoal} />
      </SafeAreaView>
    );
  }

  // ==========================================
  // 1. PRE-REVIEW OVERVIEW SCREEN (When not in active session)
  // ==========================================
  if (!isSessionActive) {
    // If no pending reviews at all
    if (pendingGroups.length === 0 || !selectedGroup) {
      return (
        <SafeAreaView style={s.container} edges={['top']}>
          <View style={s.content}>

            <View style={s.overviewHeader}>
              <Text style={s.overviewHeaderTitle}>Review</Text>
            </View>



            <View style={s.emptyContainer}>
              <View style={s.emptyIconCircle}>
                <CheckCircle2 size={48} color={COLORS.charcoal} strokeWidth={1.5} />
              </View>
              <Text style={s.emptyTitle}>All Caught Up!</Text>
              <Text style={s.emptySub}>
                No reviews are pending right now. All your vocabulary cards are up to date with your FSRS schedule.
              </Text>
              <AnimatedPressable
                onPress={() => router.replace('/(tabs)/dashboard')}
                style={s.goToDashboardBtn}
                activeOpacity={0.8}
              >
                <Text style={s.goToDashboardBtnText}>Go to Dashboard</Text>
              </AnimatedPressable>
            </View>

          </View>
        </SafeAreaView>
      );
    }

    // Pending reviews available: Show batch overview with Start Review button
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.content}>

          <View style={s.overviewHeader}>
            <Text style={s.overviewHeaderTitle}>Vocabulary Review</Text>
            <View style={s.pendingBadgeTop}>
              <Text style={s.pendingBadgeTopText}>
                {pendingGroups.reduce((acc, g) => acc + g.count, 0)} Total Due
              </Text>
            </View>
          </View>


          <View style={{ flex: 1 }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
            >
              {/* Main Pending Group Card */}

              <View style={s.mainBatchCard}>
                <View style={s.batchCardHeader}>
                  <View style={s.sparkleIconWrap}>
                    <Sparkles size={22} color={COLORS.charcoal} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.batchLabel}>Next Due Batch</Text>
                    <Text style={s.batchDateText}>{formatDateDisplay(selectedGroup.date)}</Text>
                  </View>
                </View>

                <View style={s.batchStatRow}>
                  <View style={s.batchStatBox}>
                    <Text style={s.batchStatNum}>{selectedGroup.count}</Text>
                    <Text style={s.batchStatLabel}>Words to Review</Text>
                  </View>
                  <View style={s.batchStatDivider} />
                  <View style={s.batchStatBox}>
                    <Text style={s.batchStatNum}>FSRS</Text>
                    <Text style={s.batchStatLabel}>Spaced Repetition</Text>
                  </View>
                </View>

                <Text style={s.batchDescription}>
                  Reviewing today strengthens memory retention before forgetting occurs according to your interval schedule.
                </Text>

                {/* Start Review CTA Button */}
                <AnimatedPressable
                  onPress={() => handleStartReview(selectedGroup)}
                  style={s.startReviewCTA}
                  activeOpacity={0.85}
                >
                  <Play size={20} color={COLORS.bg} fill={COLORS.bg} />
                  <Text style={s.startReviewCTAText}>Start Review</Text>
                </AnimatedPressable>
              </View>


              {/* If there are more pending groups, display them as a list */}
              {pendingGroups.length > 1 && (
                <View style={s.otherGroupsSection}>
                  <Text style={s.otherGroupsTitle}>Other Pending Batches ({pendingGroups.length - 1})</Text>
                  {pendingGroups
                    .filter((g) => g.date !== selectedGroup.date)
                    .map((group, index) => (
                      <AnimatedPressable
                        key={index}
                        onPress={() => setSelectedGroup(group)}
                        style={s.otherGroupRow}
                        activeOpacity={0.7}
                      >
                        <View style={s.otherGroupLeft}>
                          <View style={s.otherGroupCalIcon}>
                            <BookOpen size={18} color={COLORS.charcoal} />
                          </View>
                          <View>
                            <Text style={s.otherGroupDate}>{formatDateDisplay(group.date)}</Text>
                            <Text style={s.otherGroupCount}>{group.count} Words Pending</Text>
                          </View>
                        </View>
                        <View style={s.otherGroupSelectBtn}>
                          <ArrowRight size={16} color={COLORS.charcoal} />
                        </View>
                      </AnimatedPressable>

                    ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // 2. SESSION COMPLETE SCREEN
  // ==========================================
  if (currentIndex >= sessionWords.length) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>

        <View style={[s.content, s.center, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
          <View style={s.completeCircle}>
            <CheckCircle2 size={56} color={COLORS.charcoal} strokeWidth={1.5} />
          </View>
          <Text style={s.completeTitle}>Batch Completed! 🎉</Text>
          <Text style={s.completeSub}>
            You've successfully reviewed all {sessionWords.length} words for {formatDateDisplay(selectedGroup?.date || '')}.
          </Text>
          <AnimatedPressable
            onPress={handleExitSession}
            style={s.goToDashboardBtn}
            activeOpacity={0.8}
          >
            <Text style={s.goToDashboardBtnText}>Back to Reviews</Text>
          </AnimatedPressable>
        </View>

      </SafeAreaView>
    );
  }

  // ==========================================
  // 3. ACTIVE FLASHCARD REVIEW SCREEN
  // ==========================================
  const remaining = sessionWords.length - currentIndex;
  const progressRatio = sessionWords.length > 0 ? currentIndex / sessionWords.length : 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={[s.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <AnimatedPressable style={s.iconBtn} onPress={handleExitSession}>
              <ChevronLeft size={24} color={COLORS.charcoal} strokeWidth={2.5} />
            </AnimatedPressable>
            <View>
              <Text style={s.headerTitle}>Reviewing {formatDateDisplay(selectedGroup?.date || '')}</Text>
              <Text style={s.headerSub}>{remaining} Cards Remaining</Text>
            </View>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progressRatio * 100}%` }]} />
        </View>

        {/* Flashcard Stack */}
        <View style={s.cardContainer}>
          <View style={s.cardStack}>
            {sessionWords.slice(currentIndex, currentIndex + 3).reverse().map((card, idx, arr) => {
              const isTop = idx === arr.length - 1;
              const stackIndex = arr.length - 1 - idx;

              if (isTop) {
                return (
                  <AnimatedPressable
                    key={card.id || 'top'}
                    activeOpacity={0.9}
                    onPress={handleCardFlip}
                    style={[s.cardTouch, { zIndex: 10 }]}
                  >
                    {/* FRONT */}
                    <Animated.View style={[s.cardFace, s.cardFront, frontAnimatedStyle]}>
                      <Text style={s.cardWord}>{card.word}</Text>
                      <Text style={s.cardHint}>Tap to reveal meaning</Text>
                    </Animated.View>

                    {/* BACK */}
                    <Animated.View style={[s.cardFace, s.cardBack, backAnimatedStyle]}>
                      <Text style={s.cardMeaning}>{card.meaning}</Text>
                      <Text style={[s.cardHint, { marginTop: 8 }]}>{card.word}</Text>
                    </Animated.View>
                  </AnimatedPressable>
                );
              }

              // Background Stacked Cards
              return (
                <View
                  key={card.id || `stack-${stackIndex}`}
                  style={[
                    s.cardFace,
                    s.cardFront,
                    {
                      position: 'absolute',
                      zIndex: -stackIndex,
                      transform: [
                        { translateX: stackIndex * 12 },
                        { translateY: -stackIndex * 12 },
                        { rotate: `${stackIndex * 6}deg` },
                        { scale: 1 - stackIndex * 0.02 },
                      ],
                      opacity: 1,
                    },
                  ]}
                >
                  <Text style={s.cardWord}>{card.word}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={s.actions}>
          {isFlipped ? (
            <View style={s.actionsRow}>
              <AnimatedPressable
                onPress={() => handleFSRSResponse('forgot')}
                style={s.forgotBtn}
                activeOpacity={0.7}
              >
                <XCircle size={18} color={COLORS.charcoal} />
                <Text style={s.forgotText}>Forgot</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => handleFSRSResponse('remember')}
                style={s.rememberBtn}
                activeOpacity={0.7}
              >
                <CheckCircle2 size={18} color={COLORS.bg} />
                <Text style={s.rememberText}>Remember</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <AnimatedPressable onPress={handleCardFlip} style={s.flipBtn} activeOpacity={0.7}>
              <Text style={s.flipBtnText}>Flip Card to Reveal</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },

    // Overview Header
    overviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    overviewHeaderTitle: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 26,
      color: COLORS.charcoal,
    },
    pendingBadgeTop: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.bone,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    pendingBadgeTopText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: COLORS.charcoal,
    },

    // Empty State
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      marginTop: -40,
    },
    emptyIconCircle: {
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: COLORS.white,
      borderWidth: 1,
      borderColor: COLORS.bone,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
    },
    emptyTitle: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 22,
      color: COLORS.charcoal,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: COLORS.warmgray,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    goToDashboardBtn: {
      backgroundColor: COLORS.charcoal,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    goToDashboardBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: COLORS.bg,
    },

    // Main Batch Card
    mainBatchCard: {
      backgroundColor: COLORS.white,
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: COLORS.bone,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 4,
      marginBottom: 24,
    },
    batchCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 20,
    },
    sparkleIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: COLORS.card,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: COLORS.bone,
    },
    batchLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: COLORS.warmgray,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    batchDateText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 20,
      color: COLORS.charcoal,
      marginTop: 2,
    },
    batchStatRow: {
      flexDirection: 'row',
      backgroundColor: COLORS.bg,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: COLORS.bone,
      marginBottom: 16,
    },
    batchStatBox: {
      flex: 1,
      alignItems: 'center',
    },
    batchStatDivider: {
      width: 1,
      backgroundColor: COLORS.bone,
      marginVertical: 4,
    },
    batchStatNum: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 22,
      color: COLORS.charcoal,
    },
    batchStatLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: COLORS.warmgray,
      marginTop: 2,
    },
    batchDescription: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: COLORS.warmgray,
      lineHeight: 18,
      marginBottom: 20,
    },
    startReviewCTA: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.charcoal,
      paddingVertical: 16,
      borderRadius: 22,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
    startReviewCTAText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: COLORS.bg,
    },

    // Other Groups List
    otherGroupsSection: {
      marginTop: 8,
    },
    otherGroupsTitle: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 16,
      color: COLORS.charcoal,
      marginBottom: 12,
    },
    otherGroupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.white,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: COLORS.bone,
    },
    otherGroupLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    otherGroupCalIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: COLORS.lightgray,
      justifyContent: 'center',
      alignItems: 'center',
    },
    otherGroupDate: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: COLORS.charcoal,
    },
    otherGroupCount: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: COLORS.warmgray,
      marginTop: 2,
    },
    otherGroupSelectBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Active Session Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconBtn: {
      padding: 6,
      marginLeft: -6,
    },
    headerTitle: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 18,
      color: COLORS.charcoal,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: COLORS.warmgray,
      marginTop: 2,
    },

    // Progress
    progressTrack: {
      height: 4,
      backgroundColor: COLORS.bone,
      borderRadius: 2,
      overflow: 'hidden',
      marginBottom: 20,
    },
    progressFill: {
      height: '100%',
      backgroundColor: COLORS.charcoal,
      borderRadius: 2,
    },

    // Card Stack
    cardContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 12,
    },
    cardStack: {
      width: '88%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    cardTouch: {
      width: '100%',
      height: '100%',
      position: 'absolute',
    },
    cardFace: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    cardFront: {
      backgroundColor: COLORS.white,
      borderWidth: 1,
      borderColor: COLORS.bone,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    cardBack: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.bone,
    },
    cardWord: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 32,
      color: COLORS.charcoal,
      textTransform: 'capitalize',
      textAlign: 'center',
    },
    cardMeaning: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 26,
      color: COLORS.charcoal,
      textAlign: 'center',
    },
    cardHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: COLORS.warmgray,
      marginTop: 32,
      opacity: 0.6,
    },

    // Complete screen
    completeCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: COLORS.white,
      borderWidth: 1,
      borderColor: COLORS.bone,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    completeTitle: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 24,
      color: COLORS.charcoal,
      textAlign: 'center',
      marginBottom: 8,
    },
    completeSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: COLORS.warmgray,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 32,
      paddingHorizontal: 16,
    },

    // Actions
    actions: {
      paddingTop: 8,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    forgotBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: COLORS.charcoal,
      borderRadius: 24,
      paddingVertical: 14,
      gap: 8,
    },
    forgotText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: COLORS.charcoal,
    },
    rememberBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.charcoal,
      borderRadius: 24,
      paddingVertical: 14,
      gap: 8,
    },
    rememberText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: COLORS.bg,
    },
    flipBtn: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.bone,
      borderRadius: 24,
      paddingVertical: 16,
      alignItems: 'center',
    },
    flipBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: COLORS.charcoal,
    },
  });
