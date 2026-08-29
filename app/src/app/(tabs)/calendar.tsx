/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Trash2, Edit2, X, Search, BookOpen, ArrowLeft } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import { APP_COLORS } from '../../constants/theme';
import { formatLocalDateString } from '../../services/localData';
import * as Crypto from 'expo-crypto';
import { saveWordsBulk, saveWord, deleteWord } from '../../db/queries';
import { queueCloudChange } from '../../services/sync';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GRID_PADDING = 20;

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();

  const { focusDate } = useLocalSearchParams<{ focusDate?: string }>();
  const { words, loadLocalDatabase, isDarkMode, draftVocabLines } = useAppStore();

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const THEME_COLORS = useMemo(() => ({ ...COLORS, gridLine: isDarkMode ? '#2A2A2A' : '#EDEDEB' }), [COLORS, isDarkMode]);
  const s = useMemo(() => getStyles(THEME_COLORS), [THEME_COLORS]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<any | null>(null);
  const [wordText, setWordText] = useState('');
  const [meaningText, setMeaningText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  useEffect(() => {
    if (focusDate) {
      const parts = focusDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const [year, month, day] = parts;
        const target = new Date(year, month - 1, day);
        setSelectedDate(target);
        setCurrentMonth(month - 1);
        setCurrentYear(year);
      } else {
        const parsed = new Date(focusDate);
        if (!isNaN(parsed.getTime())) {
          setSelectedDate(parsed);
          setCurrentMonth(parsed.getMonth());
          setCurrentYear(parsed.getFullYear());
        }
      }
    }
  }, [focusDate]);

  const handleSearchResultClick = (word: any) => {
    setIsSearchActive(false);
    setSearchQuery('');
    const dStr = formatLocalDateString(word.dateAdded || new Date());
    if (dStr) {
      const [year, month, day] = dStr.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day);
      setSelectedDate(targetDate);
      setCurrentMonth(month - 1);
      setCurrentYear(year);
    }
  };

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
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allWords.filter((w) =>
      w.word.toLowerCase().includes(q) || (w.meaning && w.meaning.toLowerCase().includes(q))
    );
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

  const handleSaveWord = async () => {
    if (!wordText.trim() || !meaningText.trim()) return;
    try {
      if (editingWord) {
        const updatedWord = {
          ...editingWord,
          word: wordText.trim().toLowerCase(),
          meaning: meaningText.trim(),
        };
        // Offline-first: always update local SQLite first
        await saveWord(updatedWord);
        await queueCloudChange(editingWord.id, 'update', {
          word: updatedWord.word,
          meaning: updatedWord.meaning,
          updatedWord,
        });
      } else {
        const now = new Date();
        const isSelectedToday = formatLocalDateString(selectedDate) === formatLocalDateString(now);
        const wordDate = isSelectedToday
          ? now.toISOString()
          : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0).toISOString();

        const newWord = {
          id: Crypto.randomUUID(),
          word: wordText.trim().toLowerCase(),
          meaning: meaningText.trim(),
          dateAdded: wordDate,
          fsrsStability: 1.0,
          fsrsDifficulty: 5.0,
          fsrsLapses: 0,
          fsrsReps: 0,
          fsrsState: 'New',
          lastReview: null,
          nextReview: wordDate,
          reviewCount: 0,
        };
        await saveWordsBulk([newWord]);
        await queueCloudChange(newWord.id, 'add', {
          word: newWord.word,
          meaning: newWord.meaning,
          dateAdded: newWord.dateAdded,
          fsrsStability: newWord.fsrsStability,
          fsrsDifficulty: newWord.fsrsDifficulty,
          fsrsLapses: newWord.fsrsLapses,
          fsrsReps: newWord.fsrsReps,
          fsrsState: newWord.fsrsState,
          lastReview: newWord.lastReview,
          nextReview: newWord.nextReview,
          reviewCount: newWord.reviewCount,
        });
      }
      // Always refresh local DB view
      await loadLocalDatabase();
    } catch (err: any) { alert(err.message || 'Failed to update word'); }
    setIsEditorOpen(false); setEditingWord(null); setWordText(''); setMeaningText('');
  };

  const handleDeleteWord = async (word: any) => {
    try {
      await deleteWord(word.id);
      await queueCloudChange(word.id, 'delete', {});
      await loadLocalDatabase();
    } catch (err: any) { alert(err.message || 'Failed to delete word'); }
  };

  const openEditor = (word: any = null) => {
    if (word) { setEditingWord(word); setWordText(word.word); setMeaningText(word.meaning); }
    else { setEditingWord(null); setWordText(''); setMeaningText(''); }
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
            <TouchableOpacity
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
            </TouchableOpacity>
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
      <View style={s.content}>
        {/* Month Navigation */}
        <View style={s.monthNav}>
          <TouchableOpacity onPress={() => setIsYearPickerOpen(true)}>
            <Text style={s.monthTitle}>
              {MONTHS[currentMonth]} {currentYear}
            </Text>
          </TouchableOpacity>
          <View style={s.monthArrows}>
            <TouchableOpacity onPress={() => setIsSearchActive(true)} style={s.iconBtn}>
              <Search size={24} color={COLORS.charcoal} strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity onPress={prevMonth} style={s.iconBtn}>
              <ChevronLeft size={24} color={COLORS.charcoal} strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity onPress={nextMonth} style={s.iconBtn}>
              <ChevronRight size={24} color={COLORS.charcoal} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Weekday Headers */}
        <View style={s.weekRow}>
          {WEEKDAYS.map((day, idx) => (
            <Text key={idx} style={s.weekLabel}>{day}</Text>
          ))}
        </View>

        {/* Calendar Grid with borders */}
        <View style={s.gridContainer}>
          {renderCalendarGrid()}
        </View>

        {/* Selected Day Details */}
        <View style={s.selectedHeader}>
          <View>
            <Text style={s.selectedTitle}>
              {selectedDay} {selectedMonthName} {selectedYear}
            </Text>
            <Text style={s.selectedSub}>
              {selectedDateWords.length} Words Added
            </Text>
          </View>
          <TouchableOpacity onPress={() => openEditor()} style={s.iconBtn}>
            <Edit2 size={24} color={COLORS.charcoal} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Word List Box - Perfectly sized above bottom navigation bar with scrollable items inside */}
        <View style={[s.vocabCard, { marginBottom: insets.bottom + 84 }]}>
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
                  <View style={{ flex: 1, marginRight: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.wordTitle}>{item.word}</Text>
                    {item.isDraft && (
                      <View style={{ backgroundColor: COLORS.lightgray, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.warmgray }}>Draft</Text>
                      </View>
                    )}
                    <View style={s.wordDivider} />
                    <Text style={s.wordMeaning}>{item.meaning}</Text>
                  </View>
                  {!item.isDraft && (
                    <TouchableOpacity onPress={() => handleDeleteWord(item)} style={s.iconBtnSm}>
                      <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ========== ADD / EDIT MODAL ========== */}
        <Modal visible={isEditorOpen} animationType="fade" transparent>
          <View style={s.modalOverlay}>
            <View style={s.dialogBox}>
              <View style={s.dialogHeader}>
                <Text style={s.dialogTitle}>{editingWord ? 'Edit Vocabulary' : 'Add Vocabulary'}</Text>
                <TouchableOpacity onPress={() => setIsEditorOpen(false)}>
                  <X size={20} color={COLORS.charcoal} />
                </TouchableOpacity>
              </View>
              <Text style={s.fieldLabel}>English Word</Text>
              <TextInput
                placeholder="e.g. resilient" placeholderTextColor={COLORS.warmgray}
                value={wordText} onChangeText={setWordText}
                style={s.fieldInput} autoCapitalize="none"
              />
              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Meaning</Text>
              <TextInput
                placeholder="e.g. description" placeholderTextColor={COLORS.warmgray}
                value={meaningText} onChangeText={setMeaningText} style={s.fieldInput}
              />
              <TouchableOpacity onPress={handleSaveWord} style={s.dialogSaveBtn}>
                <Text style={s.dialogSaveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ========== YEAR PICKER MODAL ========== */}
        <Modal visible={isYearPickerOpen} animationType="fade" transparent>
          <View style={s.modalOverlay}>
            <View style={s.dialogBox}>
              <View style={s.dialogHeader}>
                <Text style={s.dialogTitle}>Select Year</Text>
                <TouchableOpacity onPress={() => setIsYearPickerOpen(false)}>
                  <X size={20} color={COLORS.charcoal} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                {Array.from({ length: 21 }, (_, i) => currentYear - 10 + i).map((year) => (
                  <TouchableOpacity
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
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
        {/* ========== SEARCH MODAL ========== */}
        <Modal visible={isSearchActive} animationType="fade">
          <SafeAreaView style={s.container}>
            <View style={s.searchHeader}>
              <TouchableOpacity onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}>
                <ArrowLeft size={24} color={COLORS.charcoal} />
              </TouchableOpacity>
              <TextInput
                placeholder="Search word or meaning..."
                placeholderTextColor={COLORS.warmgray}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={s.searchInput}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={20} color={COLORS.warmgray} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16 }}>
              {!searchQuery.trim() ? null : searchResults.length === 0 ? (
                <View style={s.emptyState}><Text style={s.emptyText}>No matching words found in library.</Text></View>
              ) : (
                searchResults.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleSearchResultClick(item)}
                    style={s.searchResultRow}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.searchWord}>{item.word}</Text>
                      <Text style={s.searchMeaning}>{item.meaning}</Text>
                    </View>
                    {item.dateAdded && (
                      <Text style={s.searchDate}>
                        {formatLocalDateString(item.dateAdded)}
                      </Text>
                    )}
                    {item.isDraft && (
                      <View style={{ backgroundColor: COLORS.lightgray, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.warmgray }}>Draft</Text>
                      </View>
                    )}
                  </TouchableOpacity>
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
  countBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.2)' },
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
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bone,
  },
  wordRowNum: { fontFamily: 'Inter_500Medium', fontSize: 13, color: COLORS.warmgray, marginRight: 16, width: 16 },
  wordTitle: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, textTransform: 'capitalize' },
  wordDivider: { width: 1, height: 16, backgroundColor: COLORS.bone, marginHorizontal: 12 },
  wordMeaning: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray, flex: 1 },
  iconBtnSm: { padding: 8 },

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
  searchResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  searchWord: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: COLORS.charcoal, textTransform: 'capitalize' },
  searchMeaning: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.warmgray, marginTop: 2 },
  searchDate: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warmgray, marginLeft: 12 },
});
