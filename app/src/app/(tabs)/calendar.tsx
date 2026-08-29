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
import { ChevronLeft, ChevronRight, Trash2, Edit2, X, Search, BookOpen, ArrowLeft, Plus } from 'lucide-react-native';
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
  const [calendarDrafts, setCalendarDrafts] = useState<any[]>([]);
  const [calendarEditedWords, setCalendarEditedWords] = useState<any[]>([]);
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

  const handleSaveCalendarVocab = async () => {
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

    try {
      const now = new Date();
      const isSelectedToday = formatLocalDateString(selectedDate) === formatLocalDateString(now);
      const wordDate = isSelectedToday
        ? now.toISOString()
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0).toISOString();

      const newWords = validDrafts.map((entry) => ({
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

      setCalendarDrafts([{ word: '', meaning: '' }]);
      setCalendarEditedWords([]);
      setIsEditorOpen(false);
      await loadLocalDatabase();
    } catch (err: any) {
      alert(err.message || 'Failed to save words');
    }
  };

  const handleDeleteWord = async (word: any) => {
    try {
      await deleteWord(word.id);
      await queueCloudChange(word.id, 'delete', {});
      setCalendarEditedWords(prev => prev.filter(w => w.id !== word.id));
      await loadLocalDatabase();
    } catch (err: any) { alert(err.message || 'Failed to delete word'); }
  };

  const openEditor = () => {
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
        


        {/* ========== EXPANDED VOCAB MODAL ========== */}
        <Modal visible={isEditorOpen} animationType="fade" transparent={false}>
          <SafeAreaView style={[s.container, { paddingHorizontal: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setIsEditorOpen(false)} style={{ marginRight: 16 }}>
                <ArrowLeft size={28} color={COLORS.charcoal} />
              </TouchableOpacity>
              <View style={s.datePill}>
                <Text style={s.datePillText}>
                  {selectedDay}  |  {selectedMonthName.substring(0, 3)}  |  {selectedYear}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={handleSaveCalendarVocab} style={s.savePill}>
                <Text style={s.savePillText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {calendarEditedWords.map((word, index) => (
                  <View key={`saved-${index}`} style={s.wordRow}>
                    <Text style={s.wordRowNum}>{index + 1}.</Text>
                    <View style={s.wordRowContent}>
                      <TextInput
                        style={s.wordInputSaved}
                        value={word.word}
                        onChangeText={(val) => {
                          const newArr = [...calendarEditedWords];
                          newArr[index].word = val;
                          setCalendarEditedWords(newArr);
                        }}
                        autoCapitalize="none"
                      />
                      <View style={s.rowDivider} />
                      <TextInput
                        style={s.meaningInputSaved}
                        value={word.meaning}
                        onChangeText={(val) => {
                          const newArr = [...calendarEditedWords];
                          newArr[index].meaning = val;
                          setCalendarEditedWords(newArr);
                        }}
                      />
                    </View>
                    <TouchableOpacity style={s.wordRowIcon} onPress={() => handleDeleteWord(word)}>
                      <Trash2 size={20} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                
              ))}

              {calendarDrafts.map((line, index) => (
                  <View key={`draft-${index}`} style={s.wordRow}>
                    <Text style={s.wordRowNum}>{calendarEditedWords.length + index + 1}.</Text>
                    <View style={s.wordRowContent}>
                      <TextInput
                        placeholder="Word"
                        placeholderTextColor={COLORS.warmgray}
                        value={line.word}
                        onChangeText={(val) => {
                          const newArr = [...calendarDrafts];
                          newArr[index].word = val;
                          setCalendarDrafts(newArr);
                        }}
                        style={s.wordInput}
                        autoCapitalize="none"
                      />
                      <View style={s.rowDivider} />
                      <TextInput
                        placeholder="Meaning"
                        placeholderTextColor={COLORS.warmgray}
                        value={line.meaning}
                        onChangeText={(val) => {
                          const newArr = [...calendarDrafts];
                          newArr[index].meaning = val;
                          setCalendarDrafts(newArr);
                        }}
                        style={s.meaningInput}
                      />
                    </View>
                    <TouchableOpacity style={s.wordRowIcon} onPress={() => {
                      const updated = [...calendarDrafts];
                      updated.splice(index, 1);
                      setCalendarDrafts(updated.length > 0 ? updated : [{ word: '', meaning: '' }]);
                    }}>
                      <Trash2 size={20} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                
              ))}

              <TouchableOpacity onPress={() => setCalendarDrafts([...calendarDrafts, { word: '', meaning: '' }])} style={s.addLineBtn}>
                <Plus size={24} color={COLORS.white} />
              </TouchableOpacity>
              <View style={{ height: 100 }} />
            </ScrollView>
          </SafeAreaView>
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
                      key={`search-${index}`}
                      onPress={() => {
                        const d = new Date(item.dateAdded || item.createdAt || new Date());
                        setSelectedDate(d);
                        setCurrentMonth(d.getMonth());
                        setCurrentYear(d.getFullYear());
                        setIsSearchActive(false);
                        setSearchQuery('');
                      }}
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
  wordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone, gap: 8 },
  wordRowNum: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.warmgray, width: 24 },
  wordRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  wordInput: { flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal, padding: 0 },
  wordInputSaved: { flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.charcoal },
  rowDivider: { width: 1, height: 20, backgroundColor: COLORS.bone, marginHorizontal: 12 },
  meaningInput: { flex: 1.5, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.warmgray, padding: 0 },
  meaningInputSaved: { flex: 1.5, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.charcoal },
  wordRowIcon: { padding: 8 },
  addLineBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.charcoal, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginVertical: 32 },
});

