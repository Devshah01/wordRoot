import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import AnimatedPressable from '../../components/AnimatedPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Trash2, Edit2, X, Search, BookOpen, ArrowLeft, Plus, AlertCircle } from 'lucide-react-native';
import { useAppStore, Word } from '../../store/useAppStore';
import { APP_COLORS } from '../../constants/theme';
import { formatLocalDateString, parseDateSafe } from '../../services/localData';
import * as Crypto from 'expo-crypto';
import { saveWordsBulk, deleteWord } from '../../db/queries';
import { queueCloudChange } from '../../services/sync';
import { generateDeterministicWordId } from '../../utils/idUtils';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GRID_PADDING = 20;

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();

  const { focusDate } = useLocalSearchParams<{ focusDate?: string }>();
  const { user, words, loadLocalDatabase, isDarkMode, draftVocabLines, resetDraftVocabLines } = useAppStore();

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const THEME_COLORS = useMemo(() => ({ ...COLORS, gridLine: isDarkMode ? '#2A2A2A' : '#EDEDEB' }), [COLORS, isDarkMode]);
  const s = useMemo(() => getStyles(THEME_COLORS, isDarkMode), [THEME_COLORS, isDarkMode]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorWord, setErrorWord] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [calendarDrafts, setCalendarDrafts] = useState<any[]>([]);
  const [calendarEditedWords, setCalendarEditedWords] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  useEffect(() => {
    if (focusDate) {
      const parsed = parseDateSafe(focusDate);
      if (!isNaN(parsed.getTime())) {
        setSelectedDate(parsed);
        setCurrentMonth(parsed.getMonth());
        setCurrentYear(parsed.getFullYear());
      }
    }
  }, [focusDate]);

  useFocusEffect(
    React.useCallback(() => {
      loadLocalDatabase();
    }, [loadLocalDatabase])
  );

  const selectedDateStr = formatLocalDateString(selectedDate);
  const allWords = useMemo(() => {
    const draftWords = (draftVocabLines || [])
      .filter(line => line.word.trim() && line.meaning.trim())
      .map((line, index) => ({
        id: `draft-${line.word.trim().toLowerCase()}-${index}`,
        word: line.word.trim().toLowerCase(),
        meaning: line.meaning.trim(),
        dateAdded: new Date().toISOString(),
        isDraft: true,
      }));
    return [...words, ...draftWords];
  }, [words, draftVocabLines]);

  const selectedDateWords = allWords.filter((w) => {
    const dStr = formatLocalDateString(w.dateAdded || new Date());
    return dStr === selectedDateStr;
  });

  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const seen = new Set<string>();
    const uniquePool = allWords.filter(w => {
      const key = (w.id || `${w.word}-${w.meaning}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 1. Primary: Words that start with query (dictionary prefix matching)
    const startsWithMatches = uniquePool
      .filter(w => w.word && w.word.trim().toLowerCase().startsWith(q))
      .sort((a, b) => a.word.trim().toLowerCase().localeCompare(b.word.trim().toLowerCase()));

    // For single letter search (e.g. "y"), strictly dictionary format: only words starting with that letter
    if (q.length === 1) {
      return startsWithMatches;
    }

    const containsMatches = uniquePool
      .filter(w =>
        w.word &&
        !w.word.trim().toLowerCase().startsWith(q) &&
        w.word.trim().toLowerCase().includes(q)
      )
      .sort((a, b) => a.word.trim().toLowerCase().localeCompare(b.word.trim().toLowerCase()));

    const meaningMatches = uniquePool
      .filter(w =>
        w.meaning &&
        !w.word.trim().toLowerCase().includes(q) &&
        w.meaning.toLowerCase().includes(q)
      )
      .sort((a, b) => a.word.trim().toLowerCase().localeCompare(b.word.trim().toLowerCase()));

    return [...startsWithMatches, ...containsMatches, ...meaningMatches];
  }, [allWords, searchQuery]);

  // Count words per day for the calendar
  const getWordCountForDate = (dateStr: string) => {
    return allWords.filter((w) => {
      const dStr = formatLocalDateString(w.dateAdded || new Date());
      return dStr === dateStr;
    }).length;
  };

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayIndex = getFirstDayOfMonth(currentMonth, currentYear);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const handleSaveCalendarVocab = async () => {
    setErrorWord(null);
    setErrorMessage(null);

    // Check for partially filled draft lines (word without meaning or meaning without word)
    const hasIncompleteDraft = calendarDrafts.some(
      (line) => (line.word.trim() && !line.meaning.trim()) || (!line.word.trim() && line.meaning.trim())
    );
    // Check if any edited saved word was erased to empty
    const hasIncompleteEdit = calendarEditedWords.some(
      (editedWord) => (!editedWord.word.trim() || !editedWord.meaning.trim())
    );

    if (hasIncompleteDraft || hasIncompleteEdit) {
      setErrorMessage('Word and meaning fields cannot be empty.');
      return;
    }

    const validDrafts = calendarDrafts.filter((line) => line.word.trim() && line.meaning.trim());
    
    // Find modified saved words
    const originalSelectedWords = allWords.filter((w) => {
      const dStr = formatLocalDateString(w.dateAdded || new Date());
      return dStr === selectedDateStr && !w.isDraft;
    });
      
    const modifiedWords = calendarEditedWords.filter((editedWord, i) => {
      const original = originalSelectedWords.find(w => w.id === editedWord.id);
      return original && (original.word !== editedWord.word.trim().toLowerCase() || original.meaning !== editedWord.meaning.trim());
    }).filter(w => w.word.trim() && w.meaning.trim());

    if (validDrafts.length === 0 && modifiedWords.length === 0) {
      setIsEditorOpen(false);
      return;
    }

    const allNormalizedEntries = [
      ...validDrafts.map(e => ({ id: undefined, word: e.word.trim().toLowerCase(), rawWord: e.word.trim() })),
      ...modifiedWords.map(e => ({ id: e.id, word: e.word.trim().toLowerCase(), rawWord: e.word.trim() })),
    ];

    // Check duplicate words within the current submission
    const seenWordsInBatch = new Set<string>();
    for (const item of allNormalizedEntries) {
      if (item.word.length > 100) {
        setErrorMessage(`"${item.rawWord}" exceeds the 100 character limit.`);
        setErrorWord(item.word);
        return;
      }
      if (seenWordsInBatch.has(item.word)) {
        setErrorMessage(`"${item.rawWord}" is listed more than once in your entries.`);
        setErrorWord(item.word);
        return;
      }
      seenWordsInBatch.add(item.word);
    }

    // Check meaning length limit
    const meaningTooLong = validDrafts.some(e => e.meaning.trim().length > 500) ||
                           modifiedWords.some(w => w.meaning.trim().length > 500);
    if (meaningTooLong) {
      setErrorMessage('Meaning must be 500 characters or less.');
      return;
    }

    // Check against existing words in vocabulary (excluding the word itself if editing)
    const duplicateEntry = allNormalizedEntries.find(entry =>
      words.some(w =>
        w.word.toLowerCase() === entry.word && (entry.id ? w.id !== entry.id : true)
      )
    );

    if (duplicateEntry) {
      setErrorMessage(`"${duplicateEntry.rawWord}" is already in your vocabulary.`);
      setErrorWord(duplicateEntry.word);
      return;
    }

    try {
      const now = new Date();
      const isSelectedToday = formatLocalDateString(selectedDate) === formatLocalDateString(now);
      const wordDate = isSelectedToday
        ? now.toISOString()
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0).toISOString();

      const newWords = await Promise.all(
        validDrafts.map(async (entry) => ({
          id: await generateDeterministicWordId(user?.id, entry.word),
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
        }))
      );

      const modifiedWordsWithTextChange: (Word & { oldId?: string })[] = [];
      const modifiedWordsMeaningOnly: Word[] = [];

      await Promise.all(
        modifiedWords.map(async (modWord) => {
          const originalWord = words.find(w => w.id === modWord.id);
          const trimmedWordText = modWord.word.trim().toLowerCase();
          const trimmedMeaning = modWord.meaning.trim();

          if (originalWord && originalWord.word.toLowerCase() !== trimmedWordText) {
            // Text changed: generate new deterministic ID, remove old ID locally, insert updated word
            const newId = await generateDeterministicWordId(user?.id, trimmedWordText);
            modifiedWordsWithTextChange.push({
              ...modWord,
              id: newId,
              word: trimmedWordText,
              meaning: trimmedMeaning,
              oldId: originalWord.id,
            });
            // Delete old record from local SQLite to prevent duplicate local rows
            await deleteWord(originalWord.id);
          } else {
            // Only meaning changed or original not found: keep old ID
            modifiedWordsMeaningOnly.push({
              ...modWord,
              word: trimmedWordText,
              meaning: trimmedMeaning,
            });
          }
        })
      );

      const wordsToSaveLocally = [
        ...newWords,
        ...modifiedWordsWithTextChange,
        ...modifiedWordsMeaningOnly,
      ];

      if (wordsToSaveLocally.length > 0) {
        await saveWordsBulk(wordsToSaveLocally);
      }

      for (const word of newWords) {
        await queueCloudChange(word.id, 'add', {
          ...word
        });
      }

      for (const word of modifiedWordsWithTextChange) {
        await queueCloudChange(word.oldId || word.id, 'update', {
          oldId: word.oldId,
          newId: word.id,
          word: word.word,
          meaning: word.meaning,
          updatedWord: word,
        });
      }

      for (const word of modifiedWordsMeaningOnly) {
        await queueCloudChange(word.id, 'update', {
          word: word.word,
          meaning: word.meaning,
          updatedWord: word,
        });
      }

      setCalendarDrafts([{ word: '', meaning: '' }]);
      setCalendarEditedWords([]);
      resetDraftVocabLines();
      setErrorMessage(null);
      setErrorWord(null);
      setIsEditorOpen(false);
      await loadLocalDatabase();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save words');
    }
  };

  const handleDeleteWord = async (word: any) => {
    try {
      setErrorMessage(null);
      setErrorWord(null);
      await deleteWord(word.id);
      await queueCloudChange(word.id, 'delete', { word: word.word });
      setCalendarEditedWords(prev => prev.filter(w => w.id !== word.id));
      await loadLocalDatabase();
    } catch (err: any) { setErrorMessage(err.message || 'Failed to delete word'); }
  };

  const handleSwipeLeft = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);

    setSelectedDate(next);
    setCurrentMonth(next.getMonth());
    setCurrentYear(next.getFullYear());
    
    const dStr = formatLocalDateString(next);
    const originalSelectedWords = allWords.filter((w) => {
      return formatLocalDateString(w.dateAdded || new Date()) === dStr && !w.isDraft;
    });
    setCalendarEditedWords(JSON.parse(JSON.stringify(originalSelectedWords)));
    setCalendarDrafts(Array(5).fill(null).map(() => ({ word: '', meaning: '' })));
  };

  const handleSwipeRight = () => {
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);

    setSelectedDate(prevDate);
    setCurrentMonth(prevDate.getMonth());
    setCurrentYear(prevDate.getFullYear());
    
    const dStr = formatLocalDateString(prevDate);
    const originalSelectedWords = allWords.filter((w) => {
      return formatLocalDateString(w.dateAdded || new Date()) === dStr && !w.isDraft;
    });
    setCalendarEditedWords(JSON.parse(JSON.stringify(originalSelectedWords)));
    setCalendarDrafts(Array(5).fill(null).map(() => ({ word: '', meaning: '' })));
  };

  const dayPanGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -40) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > 40) {
        runOnJS(handleSwipeRight)();
      }
    });

  const monthPanGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -40) {
        runOnJS(nextMonth)();
      } else if (e.translationX > 40) {
        runOnJS(prevMonth)();
      }
    });

  const openEditor = () => {
    setErrorMessage(null);
    const originalSelectedWords = allWords.filter((w) => {
      const dStr = formatLocalDateString(w.dateAdded || new Date());
      return dStr === selectedDateStr && !w.isDraft;
    });
    setCalendarEditedWords(JSON.parse(JSON.stringify(originalSelectedWords)));
    setCalendarDrafts(Array(5).fill(null).map(() => ({ word: '', meaning: '' })));
    setIsEditorOpen(true);
  };

  const selectedDay = selectedDate.getDate();
  const selectedMonthName = MONTHS[selectedDate.getMonth()];
  const selectedYear = selectedDate.getFullYear();

  const totalRows = Math.ceil((firstDayIndex + daysInMonth) / 7);

  const renderCalendarGrid = () => {
    const rows = [];
    let dayCounter = 1;

    for (let row = 0; row < totalRows; row++) {
      const cells = [];
      for (let col = 0; col < 7; col++) {
        const index = row * 7 + col;
        if (index < firstDayIndex || dayCounter > daysInMonth) {
          // Empty cell
          cells.push(
            <View key={`${row}-${col}`} style={[s.cell, col < 6 && s.cellBorderRight, row < totalRows - 1 && s.cellBorderBottom]} />
          );
        } else {
          const day = dayCounter;
          const date = new Date(currentYear, currentMonth, day);
          const dateStr = formatLocalDateString(date);
          const isSelected = dateStr === selectedDateStr;
          const isToday = dateStr === formatLocalDateString(new Date());
          const wordCount = getWordCountForDate(dateStr);
          dayCounter++;

          cells.push(
            <AnimatedPressable
              key={`${row}-${col}`}
              onPress={() => setSelectedDate(date)}
              style={[
                s.cell,
                col < 6 && s.cellBorderRight,
                row < totalRows - 1 && s.cellBorderBottom,
                isSelected && s.cellSelected,
              ]}
            >
              <Text style={[s.cellDay, isSelected && s.cellDaySelected, isToday && !isSelected && s.cellDayToday]}>
                {day}
              </Text>
              {wordCount > 0 && (
                <View style={[s.countBadge, isSelected && s.countBadgeSelected]}>
                  <Text style={[s.countText, isSelected && s.countTextSelected]}>{wordCount}</Text>
                </View>
              )}
            </AnimatedPressable>
          );
        }
      }
      rows.push(
        <View key={`row-${row}`} style={s.gridRow}>{cells}</View>
      );
    }
    return rows;
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <GestureDetector gesture={monthPanGesture}>
        <View style={s.content}>
          {/* Month Navigation */}
          
            <View>
              <View style={s.monthNav}>
                <AnimatedPressable onPress={() => setIsYearPickerOpen(true)}>
                  <Text style={s.monthTitle}>
                    {MONTHS[currentMonth]} {currentYear}
                  </Text>
                </AnimatedPressable>
                <View style={s.monthArrows}>
                  <AnimatedPressable onPress={() => setIsSearchActive(true)} style={s.iconBtn}>
                    <Search size={24} color={COLORS.charcoal} strokeWidth={2.5} />
                  </AnimatedPressable>
                  <AnimatedPressable onPress={prevMonth} style={s.iconBtn}>
                    <ChevronLeft size={24} color={COLORS.charcoal} strokeWidth={2.5} />
                  </AnimatedPressable>
                  <AnimatedPressable onPress={nextMonth} style={s.iconBtn}>
                    <ChevronRight size={24} color={COLORS.charcoal} strokeWidth={2.5} />
                  </AnimatedPressable>
                </View>
              </View>
            </View>
          

          {/* Weekday Headers */}
          
            <View>
              <View style={s.weekRow}>
                {WEEKDAYS.map((day, idx) => (
                  <Text key={idx} style={s.weekLabel}>{day}</Text>
                ))}
              </View>
            </View>
          

          {/* Calendar Grid with borders */}
          
            <View>
              <View style={s.gridContainer}>
                {renderCalendarGrid()}
              </View>
            </View>
          

          {/* Selected Day Details */}
          
            <View>
              <View style={s.selectedHeader}>
                <View>
                  <Text style={s.selectedTitle}>
                    {selectedDay} {selectedMonthName} {selectedYear}
                  </Text>
                  <Text style={s.selectedSub}>
                    {selectedDateWords.length} Words Added
                  </Text>
                </View>
                <AnimatedPressable onPress={() => openEditor()} style={s.iconBtn}>
                  <Edit2 size={24} color={COLORS.charcoal} strokeWidth={2.5} />
                </AnimatedPressable>
              </View>
            </View>
          

          {/* Word List Box - Perfectly sized above bottom navigation bar with scrollable items inside */}
          
            <View style={{ flex: 1 }}>
              <View style={[s.vocabCard, { marginBottom: insets.bottom + 92 }]}>
                {selectedDateWords.length === 0 ? (
                  <View style={s.emptyVocabContent}>
                    <BookOpen size={40} color={COLORS.bone} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                    <Text style={s.emptyText}>No words logged for this day.</Text>
                  </View>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingVertical: 4 }}
                  >
                    {selectedDateWords.map((item, index) => (
                      <View key={index} style={[s.wordCard, index === selectedDateWords.length - 1 && { borderBottomWidth: 0 }]}>
                        <Text style={s.wordRowNum}>{index + 1}.</Text>
                        <View style={{ flex: 1, marginRight: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: 6 }}>
                              <Text style={s.wordTitle}>{item.word}</Text>
                              {item.isDraft && (
                                <View style={{ backgroundColor: COLORS.lightgray, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.warmgray }}>Draft</Text>
                                </View>
                              )}
                            </View>
                            {!item.isDraft && (
                              <AnimatedPressable onPress={() => handleDeleteWord(item)} style={s.iconBtnSm}>
                                <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                              </AnimatedPressable>
                            )}
                          </View>
                          {item.meaning.trim() ? (
                            <Text style={s.wordMeaning}>{item.meaning}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          

          {/* ========== EXPANDED VOCAB MODAL ========== */}
        <Modal visible={isEditorOpen} animationType="fade" transparent={false}>
          <SafeAreaView style={[s.container, { paddingHorizontal: 12 }]}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
            >
              <GestureDetector gesture={dayPanGesture}>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 12 }}>
                      <AnimatedPressable onPress={() => setIsEditorOpen(false)} style={{ marginRight: 16 }}>
                        <ArrowLeft size={28} color={COLORS.charcoal} />
                      </AnimatedPressable>
                      <View style={s.datePill}>
                        <Text style={s.datePillText}>
                          {selectedDay}  |  {selectedMonthName.substring(0, 3)}  |  {selectedYear}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      <AnimatedPressable onPress={handleSaveCalendarVocab} style={s.savePill}>
                        <Text style={s.savePillText}>Save</Text>
                      </AnimatedPressable>
                    </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 160 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  automaticallyAdjustKeyboardInsets={true}
                >
                {errorMessage ? (
                  <View style={s.errorBox}>
                    <AlertCircle size={16} color={isDarkMode ? '#FCA5A5' : '#DC2626'} style={{ marginRight: 8 }} />
                    <Text style={s.errorText}>{errorMessage}</Text>
                  </View>
                ) : null}
                {calendarEditedWords.map((word, index) => {
                  const wordErr = word.word.length > 100;
                  const meaningErr = word.meaning.length > 500;
                  const normWord = word.word.trim().toLowerCase();
                  const isDuplicateErr = Boolean(errorWord && normWord && normWord === errorWord.toLowerCase());
                  const isIncompleteErr = Boolean(
                    errorMessage === 'Word and meaning fields cannot be empty.' &&
                    (!word.word.trim() || !word.meaning.trim())
                  );
                  const hasErr = wordErr || meaningErr || isDuplicateErr || isIncompleteErr;
                  return (
                    <View key={`saved-${index}`} style={{ marginBottom: 14 }}>
                      <View style={s.wordRow}>
                        <Text style={s.wordRowNumExpanded}>{index + 1}.</Text>
                        <View style={[s.wordCardBox, hasErr && s.wordRowContentError]}>
                          <View style={s.wordCardHeader}>
                            <TextInput
                              placeholder="Word"
                              placeholderTextColor={COLORS.warmgray}
                              style={s.wordInputSaved}
                              value={word.word}
                              onChangeText={(val) => {
                                if (errorMessage || errorWord) { setErrorMessage(null); setErrorWord(null); }
                                setCalendarEditedWords(prev =>
                                  prev.map((item, i) =>
                                    i === index ? { ...item, word: val } : item
                                  )
                                );
                              }}
                              autoCapitalize="none"
                            />
                            <AnimatedPressable style={s.wordRowIcon} onPress={() => handleDeleteWord(word)}>
                              <Trash2 size={18} color="#E74C3C" />
                            </AnimatedPressable>
                          </View>
                          <View style={s.wordCardDivider} />
                          <TextInput
                            placeholder="Meaning"
                            placeholderTextColor={COLORS.warmgray}
                            style={s.meaningInputSaved}
                            value={word.meaning}
                            onChangeText={(val) => {
                              if (errorMessage || errorWord) { setErrorMessage(null); setErrorWord(null); }
                              setCalendarEditedWords(prev =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, meaning: val } : item
                                )
                              );
                            }}
                            multiline={true}
                            textAlignVertical="top"
                          />
                        </View>
                      </View>
                      {hasErr && (
                        <View style={s.inlineErrorRow}>
                          <AlertCircle size={12} color="#EF4444" style={{ marginRight: 4 }} />
                          <Text style={s.inlineErrorText}>
                            {wordErr ? `Word: ${word.word.length}/100 chars ` : ''}
                            {meaningErr ? `Meaning: ${word.meaning.length}/500 chars ` : ''}
                            {isDuplicateErr ? `"${word.word.trim()}" is already in your vocabulary ` : ''}
                            {isIncompleteErr ? `Word and meaning required ` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {calendarDrafts.map((line, index) => {
                  const wordErr = line.word.length > 100;
                  const meaningErr = line.meaning.length > 500;
                  const normWord = line.word.trim().toLowerCase();
                  const isDuplicateErr = Boolean(errorWord && normWord && normWord === errorWord.toLowerCase());
                  const isIncompleteErr = Boolean(
                    errorMessage === 'Word and meaning fields cannot be empty.' &&
                    ((line.word.trim() && !line.meaning.trim()) || (!line.word.trim() && line.meaning.trim()))
                  );
                  const hasErr = wordErr || meaningErr || isDuplicateErr || isIncompleteErr;
                  return (
                    <View key={`draft-${index}`} style={{ marginBottom: 14 }}>
                      <View style={s.wordRow}>
                        <Text style={s.wordRowNumExpanded}>{calendarEditedWords.length + index + 1}.</Text>
                        <View style={[s.wordCardBox, hasErr && s.wordRowContentError]}>
                          <View style={s.wordCardHeader}>
                            <TextInput
                              placeholder="Word"
                              placeholderTextColor={COLORS.warmgray}
                              value={line.word}
                              onChangeText={(val) => {
                                if (errorMessage || errorWord) { setErrorMessage(null); setErrorWord(null); }
                                const newArr = [...calendarDrafts];
                                newArr[index].word = val;
                                setCalendarDrafts(newArr);
                              }}
                              style={s.wordInput}
                              autoCapitalize="none"
                            />
                            <AnimatedPressable style={s.wordRowIcon} onPress={() => {
                              if (errorMessage || errorWord) { setErrorMessage(null); setErrorWord(null); }
                              const updated = [...calendarDrafts];
                              updated.splice(index, 1);
                              setCalendarDrafts(updated.length > 0 ? updated : [{ word: '', meaning: '' }]);
                            }}>
                              <Trash2 size={18} color="#E74C3C" />
                            </AnimatedPressable>
                          </View>
                          <View style={s.wordCardDivider} />
                          <TextInput
                            placeholder="Meaning"
                            placeholderTextColor={COLORS.warmgray}
                            value={line.meaning}
                            onChangeText={(val) => {
                              if (errorMessage || errorWord) { setErrorMessage(null); setErrorWord(null); }
                              const newArr = [...calendarDrafts];
                              newArr[index].meaning = val;
                              setCalendarDrafts(newArr);
                            }}
                            style={s.meaningInput}
                            multiline={true}
                            textAlignVertical="top"
                          />
                        </View>
                      </View>
                      {hasErr && (
                        <View style={s.inlineErrorRow}>
                          <AlertCircle size={12} color="#EF4444" style={{ marginRight: 4 }} />
                          <Text style={s.inlineErrorText}>
                            {wordErr ? `Word: ${line.word.length}/100 chars ` : ''}
                            {meaningErr ? `Meaning: ${line.meaning.length}/500 chars ` : ''}
                            {isDuplicateErr ? `"${line.word.trim()}" is already in your vocabulary ` : ''}
                            {isIncompleteErr ? `Word and meaning required ` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                <AnimatedPressable onPress={() => {
                  if (errorMessage || errorWord) { setErrorMessage(null); setErrorWord(null); }
                  setCalendarDrafts([...calendarDrafts, { word: '', meaning: '' }]);
                }} style={s.addLineBtn}>
                  <Plus size={24} color={COLORS.white} />
                </AnimatedPressable>
                <View style={{ height: 100 }} />
              </ScrollView>
              </View>
              </GestureDetector>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

          {/* ========== YEAR PICKER MODAL ========== */}
          <Modal visible={isYearPickerOpen} animationType="fade" transparent>
            <View style={s.modalOverlay}>
              <View style={s.dialogBox}>
                <View style={s.dialogHeader}>
                  <Text style={s.dialogTitle}>Select Year</Text>
                  <AnimatedPressable onPress={() => setIsYearPickerOpen(false)}>
                    <X size={20} color={COLORS.charcoal} />
                  </AnimatedPressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                  {Array.from({ length: 21 }, (_, i) => currentYear - 10 + i).map((year) => (
                    <AnimatedPressable
                      key={year}
                      onPress={() => {
                        setCurrentYear(year);
                        setIsYearPickerOpen(false);
                      }}
                      style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone }}
                    >
                      <Text style={{ fontFamily: year === currentYear ? 'Outfit_700Bold' : 'Inter_500Medium', fontSize: 16, textAlign: 'center', color: year === currentYear ? COLORS.charcoal : COLORS.warmgray }}>
                        {year}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </ScrollView>
              </View>
            </View>
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
                {!searchQuery.trim() ? null : searchResults.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyText}>No matching words found in library.</Text></View>
                ) : (
                  searchResults.map((item, index) => (
                      <AnimatedPressable
                        key={`search-${index}`}
                        onPress={() => {
                          const d = parseDateSafe(item.dateAdded || (item as any).createdAt || new Date());
                          setSelectedDate(d);
                          setCurrentMonth(d.getMonth());
                          setCurrentYear(d.getFullYear());
                          setIsSearchActive(false);
                          setSearchQuery('');
                        }}
                        style={s.searchResultRow}
                        activeOpacity={0.7}
                      >
                        <View style={s.searchRowTop}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                            <Text style={s.searchWord} numberOfLines={1}>{item.word}</Text>
                            {item.isDraft && (
                              <View style={{ backgroundColor: COLORS.lightgray, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
                                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.warmgray }}>Draft</Text>
                              </View>
                            )}
                          </View>
                          {item.dateAdded && (
                            <Text style={s.searchDate}>
                              {formatLocalDateString(item.dateAdded)}
                            </Text>
                          )}
                        </View>
                        <Text style={s.searchMeaning}>{item.meaning}</Text>
                      </AnimatedPressable>
                    
                  ))
                )}
              </ScrollView>
            </SafeAreaView>
          </Modal>
        </View>
      </GestureDetector>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any, isDarkMode: boolean) => StyleSheet.create({
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDarkMode ? '#3B1818' : '#FEF2F2',
    borderWidth: 1,
    borderColor: isDarkMode ? '#7F1D1D' : '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: isDarkMode ? '#FCA5A5' : '#DC2626',
    flex: 1,
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 32,
    marginTop: 4,
  },
  inlineErrorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#EF4444',
  },
  wordRowContentError: {
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: GRID_PADDING, paddingTop: 4 },

  // Month Nav
  monthNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  monthTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: COLORS.charcoal },
  monthArrows: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8 },

  // Weekday
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: {
    fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.warmgray,
    textAlign: 'center',
    flex: 1,
  },

  // Calendar Grid
  gridContainer: {
    borderWidth: 1, borderColor: COLORS.gridLine, borderRadius: 12, overflow: 'hidden',
    marginBottom: 16,
  },
  gridRow: { flexDirection: 'row' },
  cell: {
    flex: 1, aspectRatio: 1.1,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  cellBorderRight: { borderRightWidth: 1, borderRightColor: COLORS.gridLine },
  cellBorderBottom: { borderBottomWidth: 1, borderBottomColor: COLORS.gridLine },
  cellSelected: { backgroundColor: COLORS.charcoal },
  cellDay: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.charcoal },
  cellDaySelected: { color: COLORS.bg, fontFamily: 'Inter_700Bold' },
  cellDayToday: { fontFamily: 'Inter_700Bold', color: COLORS.charcoal },
  countBadge: {
    marginTop: 2, backgroundColor: COLORS.lightgray,
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, minWidth: 16, alignItems: 'center',
  },
  countBadgeSelected: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.bg },
  countText: { fontFamily: 'Inter_500Medium', fontSize: 9, color: COLORS.warmgray },
  countTextSelected: { color: COLORS.bg },

  // Selected day
  selectedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 2,
  },
  selectedTitle: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal },
  selectedSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warmgray, marginTop: 2 },

  // Words Card
  vocabCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.bone,
    overflow: 'hidden',
  },
  emptyVocabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  wordCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  wordRowNum: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.warmgray, marginRight: 12, width: 20, marginTop: 2 },
  wordTitle: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, textTransform: 'capitalize' },
  wordDivider: { width: 1, height: 16, backgroundColor: COLORS.bone, marginHorizontal: 12 },
  wordMeaning: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray, marginTop: 4, lineHeight: 20 },
  iconBtnSm: { padding: 4 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray },

  // Dialog
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 24 },
  dialogBox: { backgroundColor: COLORS.bg, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: COLORS.bone },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  dialogTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.charcoal },
  fieldLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warmgray, marginBottom: 6 },
  fieldInput: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal,
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.bone,
  },
  dialogSaveBtn: { backgroundColor: COLORS.charcoal, paddingVertical: 14, borderRadius: 24, alignItems: 'center', marginTop: 24 },
  dialogSaveBtnText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.bg },
  
  // Search
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bone, gap: 12 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.bone },
  searchResultRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  searchRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  searchWord: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, textTransform: 'capitalize', flex: 1, marginRight: 12 },
  searchMeaning: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.warmgray, lineHeight: 18 },
  searchDate: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warmgray },

  // Expanded Card UI
  datePill: {
    backgroundColor: COLORS.bg,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: COLORS.bone,
    borderLeftColor: COLORS.bone,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: COLORS.card,
    borderRightColor: COLORS.card,
  },
  datePillText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: COLORS.charcoal,
    letterSpacing: 1,
  },
  savePill: { backgroundColor: COLORS.charcoal, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  savePillText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.bg },
  wordRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, gap: 8 },
  wordRowNumExpanded: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.warmgray, width: 24, marginTop: 14 },
  wordCardBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.bone,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  wordCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordCardDivider: {
    height: 1,
    backgroundColor: COLORS.bone,
    marginVertical: 8,
  },
  wordRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  wordInput: { flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, paddingVertical: 2 },
  wordInputSaved: { flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, paddingVertical: 2 },
  rowDivider: { width: 1, height: 20, backgroundColor: COLORS.bone, marginHorizontal: 12 },
  meaningInput: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal, minHeight: 48, textAlignVertical: 'top', paddingVertical: 2 },
  meaningInputSaved: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal, minHeight: 48, textAlignVertical: 'top', paddingVertical: 2 },
  wordRowIcon: { padding: 4, marginLeft: 6 },
  addLineBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.charcoal, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginVertical: 32 },
});

