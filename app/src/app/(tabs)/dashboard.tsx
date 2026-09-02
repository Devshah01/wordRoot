/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react/no-unescaped-entities */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import AnimatedPressable from '../../components/AnimatedPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { Search, Bell, ArrowLeft, Plus, Library, BookPlus, Trash2, CheckCircle2, X, Sparkles } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import { APP_COLORS } from '../../constants/theme';
import {
  computeLocalStats,
  computePendingReviewGroups,
  formatLocalDateString,
} from '../../services/localData';
import * as Crypto from 'expo-crypto';
import { saveWordsBulk, deleteWord } from '../../db/queries';
import { queueCloudChange } from '../../services/sync';

const SCREEN_WIDTH = Dimensions.get('window').width;

const ENCOURAGING_QUOTES = [
  "Level up your vocab! 🚀",
  "Expand your mind! 💡",
  "Master your words! ⚔️",
  "Fuel your language! 🔥",
  "Conquer new words! 🏆",
  "Build your arsenal! 🛡️"
];

export default function DashboardScreen() {
  const {
    user,
    words,
    guestName,
    loadLocalDatabase,
    isDarkMode,
    draftVocabLines: vocabLines,
    setDraftVocabLines: setVocabLines,
    setIsTabBarHidden,
  } = useAppStore();

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const s = React.useMemo(() => getStyles(COLORS), [COLORS]);

  const bellAnim = useSharedValue(SCREEN_WIDTH);
  const animatedBellStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: bellAnim.value }],
    };
  });

  const openBell = () => {
    setIsBellOpen(true);
    bellAnim.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.poly(4)) });
  };
  const closeBell = () => {
    bellAnim.value = withTiming(SCREEN_WIDTH, { duration: 250, easing: Easing.in(Easing.poly(4)) }, () => {
      runOnJS(setIsBellOpen)(false);
    });
  };

  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [isVocabCardExpanded, setIsVocabCardExpanded] = useState(false);
  const [editedSavedWords, setEditedSavedWords] = useState<any[]>([]);
  const [currentDashboardDate, setCurrentDashboardDate] = useState<Date>(new Date());

  const [stats, setStats] = useState({
    totalWords: 0,
    wordsAddedToday: 0,
  });

  // Calculate local stats and pending reviews from SQLite (offline-first)
  useEffect(() => {
    setStats(computeLocalStats(words));
    setPendingReviews(computePendingReviewGroups(words));
  }, [words]);

  const [randomQuote] = useState(() => {
    return ENCOURAGING_QUOTES[Math.floor(Math.random() * ENCOURAGING_QUOTES.length)];
  });

  const getFormattedDate = (dateToFormat = currentDashboardDate) => {
    const today = dateToFormat;
    const day = today.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[today.getMonth()];
    const year = today.getFullYear();
    return `${day}  |  ${month}  |  ${year}`;
  };

  const fetchDashboardData = React.useCallback(async () => {
    try {
      await loadLocalDatabase();
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    }
  }, [loadLocalDatabase]);

  useFocusEffect(
    React.useCallback(() => {
      setIsVocabCardExpanded(false);
      setIsTabBarHidden(false);
      fetchDashboardData();
    }, [fetchDashboardData, setIsTabBarHidden])
  );

  const handleSwipeLeft = () => {
    setCurrentDashboardDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleSwipeRight = () => {
    setCurrentDashboardDate(prev => {
      const prevDate = new Date(prev);
      prevDate.setDate(prevDate.getDate() - 1);
      return prevDate;
    });
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -40) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > 40) {
        runOnJS(handleSwipeRight)();
      }
    });

  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); return; }
    const query = searchQuery.toLowerCase();

    const draftWords = vocabLines
      .filter(l => l.word.trim() && l.meaning.trim())
      .map(l => ({ ...l, dateAdded: new Date().toISOString() }));

    const searchPool = [...words, ...draftWords];

    const matches = searchPool.filter(
      (w) => w.word.toLowerCase().includes(query) || (w.meaning && w.meaning.toLowerCase().includes(query))
    );
    setSearchResults(matches);
  }, [searchQuery, words, vocabLines]);

  const addVocabLine = () => {
    setVocabLines([...vocabLines, { word: '', meaning: '' }]);
  };

  const updateVocabLine = (index: number, key: 'word' | 'meaning', value: string) => {
    const updated = [...vocabLines];
    updated[index][key] = value;
    setVocabLines(updated);
  };

  const removeVocabLine = (index: number) => {
    const updated = [...vocabLines];
    updated.splice(index, 1);
    setVocabLines(updated.length > 0 ? updated : [{ word: '', meaning: '' }]);
  };

  const handleSaveVocab = async () => {
    const validEntries = vocabLines.filter((line) => line.word.trim() && line.meaning.trim());

    // Find modified saved words
    const todayStr = formatLocalDateString(new Date());
    const originalTodayWords = words
      .filter(w => w.dateAdded && formatLocalDateString(w.dateAdded) === todayStr)
      .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());

    const modifiedWords = editedSavedWords.filter((editedWord, i) => {
      const original = originalTodayWords.find(w => w.id === editedWord.id);
      return original && (original.word !== editedWord.word.trim().toLowerCase() || original.meaning !== editedWord.meaning.trim());
    }).filter(w => w.word.trim() && w.meaning.trim()); // ensure they aren't blanked out

    if (validEntries.length === 0 && modifiedWords.length === 0) {
      setIsVocabCardExpanded(false);
      setIsTabBarHidden(false);
      return;
    }

    const wordExists = [...validEntries, ...modifiedWords].some(entry => words.some(w => w.word.toLowerCase() === entry.word.toLowerCase() && !editedSavedWords.find(ew => ew.id === w.id)));

    if (wordExists) {
      alert('This word is already in your vocabulary.');
      return;
    }

    // Only allow saving drafts if we are on today's date in dashboard
    const isToday = formatLocalDateString(currentDashboardDate) === formatLocalDateString(new Date());
    let wordDate = new Date().toISOString();

    if (!isToday) {
      const d = currentDashboardDate;
      wordDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
    }

    try {
      const newWords = validEntries.map((entry) => ({
        id: Crypto.randomUUID(),
        word: entry.word.trim().toLowerCase(),
        meaning: entry.meaning.trim(),
        dateAdded: wordDate,
        fsrsStability: 1.0,
        fsrsDifficulty: 5.0,
        fsrsLapses: 0,
        fsrsReps: 0,
        fsrsState: 'New',
        lastReview: null,
        nextReview: wordDate,
        reviewCount: 0,
      }));

      const finalModifiedWords = modifiedWords.map(w => ({
        ...w,
        word: w.word.trim().toLowerCase(),
        meaning: w.meaning.trim(),
      }));

      if (newWords.length > 0 || finalModifiedWords.length > 0) {
        await saveWordsBulk([...newWords, ...finalModifiedWords]);
      }

      for (const word of newWords) {
        await queueCloudChange(word.id, 'add', {
          ...word
        });
      }

      for (const word of finalModifiedWords) {
        await queueCloudChange(word.id, 'update', {
          word: word.word,
          meaning: word.meaning,
          updatedWord: word,
        });
      }

      setVocabLines(Array(5).fill(null).map(() => ({ word: '', meaning: '' })));
      setEditedSavedWords([]);
      setIsVocabCardExpanded(false);
      setIsTabBarHidden(false);
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Failed to save words');
    }
  };

  const handleDeleteSavedWord = async (wordObj: any) => {
    try {
      await deleteWord(wordObj.id);
      await queueCloudChange(wordObj.id, 'delete', {});
      setEditedSavedWords(prev => prev.filter(w => w.id !== wordObj.id));
      await fetchDashboardData();
    } catch (e: any) {
      alert(e.message || 'Failed to delete word');
    }
  };

  const handleToggleExpand = () => {
    const nextState = !isVocabCardExpanded;
    setIsVocabCardExpanded(nextState);
    setIsTabBarHidden(nextState);
    if (nextState) {
      const targetStr = formatLocalDateString(currentDashboardDate);
      const targetWords = words
        .filter(w => w.dateAdded && formatLocalDateString(w.dateAdded) === targetStr)
        .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());
      setEditedSavedWords(JSON.parse(JSON.stringify(targetWords)));
    } else {
      setEditedSavedWords([]);
    }
  };

  const handleStartReviewFromBell = (dateStr: string) => {
    setIsBellOpen(false);
    router.push({ pathname: '/(tabs)/review', params: { date: dateStr } });
  };

  const handleSearchResultClick = (word: any) => {
    setIsSearchActive(false);
    setSearchQuery('');
    const dateAddedStr = formatLocalDateString(word.dateAdded || new Date());
    router.push({ pathname: '/(tabs)/calendar', params: { focusDate: dateAddedStr } });
  };

  const displayName = user ? user.username : (guestName || 'Explorer');

  const isToday = formatLocalDateString(currentDashboardDate) === formatLocalDateString(new Date());
  const draftCount = isToday ? vocabLines.filter(line => line.word.trim().length > 0 && line.meaning.trim().length > 0).length : 0;

  const currentStr = formatLocalDateString(currentDashboardDate);
  const wordsForDate = words.filter(w => w.dateAdded && formatLocalDateString(w.dateAdded) === currentStr).length;

  const displayWordsAddedToday = wordsForDate + draftCount;
  const displayTotalWords = stats.totalWords + (isToday ? vocabLines.filter(line => line.word.trim().length > 0 && line.meaning.trim().length > 0).length : 0);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.content}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greetingLabel}>{randomQuote}</Text>
          </View>
          <View>
            <View style={s.headerRow2}>
              <Text style={s.displayNameText}>{displayName} 👋</Text>
              <View style={s.headerIcons}>
                <AnimatedPressable onPress={() => setIsSearchActive(true)} style={s.iconBtn}>
                  <Search size={24} color={COLORS.charcoal} strokeWidth={2.5} />
                </AnimatedPressable>
                <AnimatedPressable onPress={openBell} style={s.iconBtn}>
                  <Bell size={24} color={COLORS.charcoal} strokeWidth={2.5} />
                  {pendingReviews.length > 0 && <View style={s.badge} />}
                </AnimatedPressable>
              </View>
            </View>
          </View>
        </View>

        <View style={{ flex: 1, paddingBottom: insets.bottom + 92 }}>
          {/* Today's Vocabulary Card */}
          <View>
            <Text style={s.sectionLabel}>
              {formatLocalDateString(currentDashboardDate) === formatLocalDateString(new Date())
                ? "Today's Vocabulary"
                : "Vocabulary"}
            </Text>

            <GestureDetector gesture={panGesture}>
              <TouchableOpacity
                onPress={handleToggleExpand}
                style={s.vocabCard}
                activeOpacity={0.9}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                  <View style={[s.datePill, { marginBottom: 0 }]}>
                    <Text style={s.datePillText}>{getFormattedDate()}</Text>
                  </View>
                </View>

                {/* COLLAPSED STATE */}
                <View>
                  <View style={s.vocabSlotList}>
                    {[1, 2, 3, 4, 5].map((num) => {
                      // Merge draft vocab lines into display for guest mode
                      const isToday = formatLocalDateString(currentDashboardDate) === formatLocalDateString(new Date());
                      const draftWords = isToday ? vocabLines
                        .filter(l => l.word.trim() && l.meaning.trim())
                        .map(l => ({ ...l, dateAdded: new Date().toISOString() })) : [];
                      const todayStr = formatLocalDateString(currentDashboardDate);
                      const todayLibraryWords = [...words]
                        .filter(w => w.dateAdded && formatLocalDateString(w.dateAdded) === todayStr)
                        .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());

                      // Show today's saved words first (chronological), then drafts
                      const seen = new Set<string>();
                      const allDisplayWords = [...todayLibraryWords, ...draftWords].filter(w => {
                        const key = w.word.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      const recentWord = allDisplayWords[num - 1];
                      const hasWord = !!recentWord && recentWord.word.trim().length > 0;
                      return (
                        <View key={num} style={s.vocabSlot}>
                          <Text style={s.vocabSlotNum}>{num}.</Text>
                          {hasWord ? (
                            <View style={s.collapsedTextContainer}>
                              <Text style={s.collapsedWordText} numberOfLines={1}>
                                {recentWord.word}
                                {recentWord.meaning.trim() ? (
                                  <Text style={s.collapsedMeaningText}> — {recentWord.meaning}</Text>
                                ) : null}
                              </Text>
                            </View>
                          ) : (
                            <View style={s.vocabSlotLine} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <View style={s.vocabAddRow}>
                    <View style={{ flex: 1 }} />
                    <View style={s.addCircle}>
                      <Plus size={24} color={COLORS.charcoal} strokeWidth={2} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </GestureDetector>
          </View>

          {/* Stats Column */}
          <View style={[s.statsColumn, { flex: 1 }]}>
            <View style={{ flex: 1 }}>
              <View style={[s.statCardLarge, { flex: 1, justifyContent: 'center', gap: 12 }]}>
                <View style={s.statCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={s.statDot} />
                    <Text style={s.statLabelSmall}>
                      {isToday ? "Today's Words" : "Words Added"}
                    </Text>
                  </View>
                  <BookPlus size={20} color={COLORS.warmgray} strokeWidth={2} />
                </View>
                <View style={s.statBottom}>
                  <Text style={s.statValueSmall}>{displayWordsAddedToday}</Text>
                  <Text style={s.statSuffix}>Added</Text>
                </View>
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <View style={[s.statCardLarge, { flex: 1, justifyContent: 'center', gap: 12 }]}>
                <View style={s.statCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[s.statDot, { backgroundColor: COLORS.warmgray }]} />
                    <Text style={s.statLabelSmall}>Vocabulary Library</Text>
                  </View>
                  <Library size={20} color={COLORS.warmgray} strokeWidth={2} />
                </View>
                <View style={s.statBottom}>
                  <Text style={s.statValueSmall}>{displayTotalWords.toLocaleString()}</Text>
                  <Text style={s.statSuffix}>Total Words</Text>
                </View>
              </View>
            </View>
          </View>
        </View>


        {/* ========== EXPANDED VOCAB MODAL ========== */}
        <Modal visible={isVocabCardExpanded} animationType="fade" transparent={false}>
          <SafeAreaView style={[s.container, { paddingHorizontal: 12 }]}>
            <GestureDetector gesture={panGesture}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 12 }}>
                  <AnimatedPressable onPress={handleToggleExpand} style={{ marginRight: 16 }}>
                    <ArrowLeft size={28} color={COLORS.charcoal} />
                  </AnimatedPressable>
                  <View style={[s.datePill, s.expandedDatePill]}>
                    <Text style={s.datePillText}>{getFormattedDate()}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <AnimatedPressable onPress={handleSaveVocab} style={s.savePill}>
                    <Text style={s.savePillText}>Save</Text>
                  </AnimatedPressable>
                </View>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {editedSavedWords.map((word, index) => (
                    <View key={`saved-${index}`} style={s.wordRow}>
                      <Text style={s.wordRowNum}>{index + 1}.</Text>
                      <View style={s.wordRowContent}>
                        <TextInput
                          style={s.wordInputSaved}
                          value={word.word}
                          onChangeText={(val) => {
                            const newArr = [...editedSavedWords];
                            newArr[index].word = val;
                            setEditedSavedWords(newArr);
                          }}
                          autoCapitalize="none"
                        />
                        <View style={s.rowDivider} />
                        <TextInput
                          style={s.meaningInputSaved}
                          value={word.meaning}
                          onChangeText={(val) => {
                            const newArr = [...editedSavedWords];
                            newArr[index].meaning = val;
                            setEditedSavedWords(newArr);
                          }}
                        />
                      </View>
                      <AnimatedPressable style={s.wordRowIcon} onPress={() => handleDeleteSavedWord(word)}>
                        <Trash2 size={20} color="#E74C3C" />
                      </AnimatedPressable>
                    </View>
                  ))}

                  {vocabLines.map((line, index) => (
                    <View key={`line-${index}`} style={s.wordRow}>
                      <Text style={s.wordRowNum}>{editedSavedWords.length + index + 1}.</Text>
                      <View style={s.wordRowContent}>
                        <TextInput
                          placeholder="Word"
                          placeholderTextColor={COLORS.warmgray}
                          value={line.word}
                          onChangeText={(val) => updateVocabLine(index, 'word', val)}
                          style={s.wordInput}
                          autoCapitalize="none"
                        />
                        <View style={s.rowDivider} />
                        <TextInput
                          placeholder="Meaning"
                          placeholderTextColor={COLORS.warmgray}
                          value={line.meaning}
                          onChangeText={(val) => updateVocabLine(index, 'meaning', val)}
                          style={s.meaningInput}
                        />
                      </View>
                      <AnimatedPressable style={s.wordRowIcon} onPress={() => removeVocabLine(index)}>
                        <Trash2 size={20} color="#E74C3C" />
                      </AnimatedPressable>
                    </View>
                  ))}
                  <AnimatedPressable onPress={addVocabLine} style={[s.addLineBtn, { alignSelf: 'center', marginTop: 32 }]}>
                    <Plus size={24} color={COLORS.white} />
                  </AnimatedPressable>
                  <View style={{ height: 100 }} />
                </ScrollView>
              </View>
            </GestureDetector>
          </SafeAreaView>
        </Modal>

        {/* ========== BELL MODAL ========== */}
        <Modal visible={isBellOpen} animationType="none" transparent onRequestClose={closeBell}>
          <AnimatedPressable activeOpacity={1} onPress={closeBell} style={s.modalOverlay} />
          <Animated.View style={[s.bellDrawer, animatedBellStyle]}>
            <SafeAreaView style={s.container}>
              <View style={[s.modalHeader, { borderBottomColor: COLORS.bone }]}>
                <View style={{ width: 24 }} />
                <Text style={[s.modalTitle, { color: COLORS.charcoal }]}>Notifications</Text>
                <AnimatedPressable onPress={closeBell}>
                  <X size={24} color={COLORS.charcoal} />
                </AnimatedPressable>
              </View>
              <ScrollView style={{ flex: 1, paddingHorizontal: 24 }}>
                <Text style={[s.sectionLabel, { marginTop: 14 }]}>Pending Reviews</Text>
                {pendingReviews.length === 0 ? (
                  <View style={[s.statCardLarge, { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, minHeight: 220, marginTop: 12 }]}>
                    <CheckCircle2 size={48} color={COLORS.warmgray} strokeWidth={1.5} style={{ marginBottom: 16 }} />
                    <Text style={[s.emptyText, { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.charcoal }]}>All Caught Up!</Text>
                    <Text style={[s.emptyText, { marginTop: 8 }]}>No pending reviews at the moment.</Text>
                  </View>
                ) : (
                  pendingReviews.map((group, index) => (
                    <View key={index} style={s.reviewRow}>
                      <View style={s.reviewRowLeft}>
                        <View style={s.calIcon}>
                          <Sparkles size={20} color={COLORS.charcoal} />
                        </View>
                        <View>
                          <Text style={s.reviewDate}>
                            {group.date?.includes('-') ? group.date.split('-').reverse().join('-') : group.date}
                          </Text>
                          <Text style={s.reviewCount}>{group.count} Words</Text>
                        </View>
                      </View>
                      <AnimatedPressable onPress={() => handleStartReviewFromBell(group.date)} style={s.reviewBtn}>
                        <Text style={s.reviewBtnText}>Review</Text>
                      </AnimatedPressable>
                    </View>

                  ))
                )}
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </Modal>

        {/* ========== SEARCH MODAL ========== */}
        <Modal visible={isSearchActive} animationType="fade">
          <SafeAreaView style={s.container}>
            <View style={s.searchHeader}>
              <AnimatedPressable onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}>
                <ArrowLeft size={24} color={COLORS.charcoal} />
              </AnimatedPressable>
              <TextInput
                placeholder="Search word or meaning..."
                placeholderTextColor={COLORS.warmgray}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={s.searchInput}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <AnimatedPressable onPress={() => setSearchQuery('')}>
                  <X size={20} color={COLORS.warmgray} />
                </AnimatedPressable>
              )}
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16 }}>
              {searchQuery.length > 0 && searchResults.length === 0 ? (
                <View style={s.emptyState}><Text style={s.emptyText}>No matching words found.</Text></View>
              ) : (
                searchResults.map((item, index) => (
                  <AnimatedPressable key={`search-${index}`} onPress={() => handleSearchResultClick(item)} style={s.searchResultRow}>
                    <View>
                      <Text style={s.searchWord}>{item.word}</Text>
                      <Text style={s.searchMeaning}>{item.meaning}</Text>
                    </View>
                    <Text style={s.searchDate}>{formatLocalDateString(item.dateAdded || item.createdAt || new Date())}</Text>
                  </AnimatedPressable>

                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 12 }, // Reduced top padding

  // Header — two-line layout
  header: {
    flexDirection: 'column',
    marginBottom: 8,
  },
  greetingLabel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    color: COLORS.charcoal,
    marginBottom: 2,
  },
  headerRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  displayNameText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    color: COLORS.charcoal,
  },
  headerIcons: { flexDirection: 'row', gap: 4 },
  bellDrawer: {
    width: SCREEN_WIDTH,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: COLORS.bg,
  },
  iconBtn: {
    padding: 8,
  },
  badge: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#E74C3C',
    borderWidth: 1.5, borderColor: COLORS.white,
  },

  // Vocab Card — tall, occupies most of screen
  vocabCard: {
    backgroundColor: COLORS.white,
    borderRadius: 30,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.bone,
    // Add subtle depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  datePill: {
    backgroundColor: COLORS.bg,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 24,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopColor: COLORS.bone,
    borderLeftColor: COLORS.bone,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: COLORS.white,
    borderRightColor: COLORS.white,
    marginBottom: 10,
  },
  expandedDatePill: {
    marginBottom: 0,
    borderWidth: 1,
    borderColor: COLORS.bone,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  datePillText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: COLORS.charcoal,
    letterSpacing: 1,
  },
  vocabSlotList: { gap: 4 },
  vocabSlot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vocabSlotNum: { fontFamily: 'Inter_500Medium', fontSize: 15, color: COLORS.warmgray, width: 22 },
  collapsedTextContainer: { flex: 1, paddingBottom: 2 },
  collapsedWordText: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal },
  collapsedMeaningText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray },
  vocabSlotLine: { flex: 1, height: 1, backgroundColor: COLORS.bone },
  vocabAddRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  addCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.bg,
    justifyContent: 'center', alignItems: 'center',
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopColor: COLORS.bone,
    borderLeftColor: COLORS.bone,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: COLORS.white,
    borderRightColor: COLORS.white,
  },

  // Stats Column — Stacked vertically
  statsColumn: { flexDirection: 'column', gap: 16, marginBottom: 0 },
  statCardLarge: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.bone,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.charcoal,
  },
  statLabelSmall: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.warmgray },
  statBottom: { flexDirection: 'row', alignItems: 'baseline', gap: 6, transform: [{ translateY: -8 }] },
  statValueSmall: { fontFamily: 'Outfit_700Bold', fontSize: 22, color: COLORS.charcoal },
  statSuffix: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.warmgray },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.charcoal },
  savePill: { backgroundColor: COLORS.charcoal, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  savePillText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.bg },
  wordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone, gap: 8 },
  wordRowNum: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.warmgray, width: 24 },
  wordRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  wordInput: { flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, padding: 0 },
  wordInputSaved: { flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal },
  rowDivider: { width: 1, height: 20, backgroundColor: COLORS.bone, marginHorizontal: 12 },
  meaningInput: { flex: 1.5, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray, padding: 0 },
  meaningInputSaved: { flex: 1.5, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal },
  wordRowIcon: { padding: 8 },
  addLineBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.charcoal, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end', marginVertical: 20 },

  // Notifications
  sectionLabel: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, marginBottom: 8 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bone },
  reviewRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  calIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.lightgray, justifyContent: 'center', alignItems: 'center' },
  reviewDate: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.charcoal },
  reviewCount: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warmgray, marginTop: 2 },
  reviewBtn: { backgroundColor: COLORS.charcoal, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  reviewBtnText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.bg },

  // Search
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bone, gap: 12 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.bone },
  searchResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  searchWord: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: COLORS.charcoal, textTransform: 'capitalize' },
  searchMeaning: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.warmgray, marginTop: 2 },
  searchDate: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warmgray },

  emptyState: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
