/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import AnimatedPressable from '../../components/AnimatedPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { Settings, LogOut, X, ChevronRight, Trophy, Clock, Check, Cloud, RefreshCw, Smartphone, Trash2 } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AnalogClockPicker from '../../components/AnalogClockPicker';
import { useAppStore } from '../../store/useAppStore';
import { APP_COLORS } from '../../constants/theme';
import { computeTotalReviews } from '../../services/localData';
import { performCloudSync, getLastSyncLabel } from '../../services/sync';

export default function ProfileScreen() {
  const {
    user,
    isAuthenticated,
    clearAuth,
    updateNotificationTime,
    isDarkMode,
    setIsDarkMode,
    guestNotificationTime,
    guestName,
    setGuestName,
    words,
    loadLocalDatabase,
  } = useAppStore();
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const s = React.useMemo(() => getStyles(COLORS, SCREEN_WIDTH), [COLORS, SCREEN_WIDTH]);
  const insets = useSafeAreaInsets();

  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isKeepingData, setIsKeepingData] = useState(false);
  const slideAnim = useSharedValue(-SCREEN_WIDTH);
  
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime24, setTempTime24] = useState('16:00');

  const openTimePicker = () => {
    const time24 = user?.notificationTime || guestNotificationTime;
    setTempTime24(time24);
    setShowTimePicker(true);
  };

  const confirmTimeSelection = () => {
    updateNotificationTime(tempTime24);
    setShowTimePicker(false);
  };

  const formatTimeForDisplay = (time24: string) => {
    const parts = time24.split(':');
    if (parts.length !== 2) return time24;
    let [hours, minutes] = parts.map(Number);
    if (isNaN(hours) || isNaN(minutes)) return time24;
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const localTotalReviews = React.useMemo(
    () => computeTotalReviews(words || []),
    [words]
  );

  const [totalReviews, setTotalReviews] = useState(localTotalReviews);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const refreshProfile = React.useCallback(async () => {
    await loadLocalDatabase();
    setTotalReviews(computeTotalReviews(useAppStore.getState().words));
    const label = await getLastSyncLabel();
    setLastSynced(label);
  }, [loadLocalDatabase]);

  useFocusEffect(
    React.useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  useEffect(() => {
    setTotalReviews(localTotalReviews);
  }, [localTotalReviews]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage('');
    try {
      const result = await performCloudSync();
      setSyncMessage(result.message);
      await refreshProfile();
    } catch {
      setSyncMessage('Sync failed. Your local data is safe.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = () => {
    setIsLogoutModalVisible(true);
  };

  const executeLogout = async (clearLocalData: boolean) => {
    setIsLoggingOut(true);
    if (clearLocalData) setIsClearingData(true);
    else setIsKeepingData(true);
    try {
      // Attempt a background sync before logout so cloud has latest data
      await performCloudSync();
    } catch {
      // Continue even if network is unavailable
    }
    await clearAuth(clearLocalData);
    setIsLoggingOut(false);
    setIsClearingData(false);
    setIsKeepingData(false);
    setIsLogoutModalVisible(false);
  };



  const openSettings = () => {
    setIsSettingsVisible(true);
    slideAnim.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.poly(4)) });
  };

  const closeSettings = () => {
    slideAnim.value = withTiming(-SCREEN_WIDTH, { duration: 250, easing: Easing.in(Easing.poly(4)) }, () => {
      runOnJS(setIsSettingsVisible)(false);
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideAnim.value }],
  }));

  const displayName = user ? user.username : (guestName || 'Explorer');
  const displayEmail = user ? user.email : 'No email (Offline mode)';
  const initial = displayName.charAt(0).toUpperCase();

  const handleSaveName = async () => {
    if (editNameValue.trim().length > 0) {
      await setGuestName(editNameValue.trim());
    }
    setIsEditingName(false);
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: COLORS.bg }]} edges={['top']}>
      <View style={s.content}>
        {/* Header */}
        
          <View>
            <View style={s.header}>
              <Text style={[s.headerTitle, { color: COLORS.charcoal }]}>Profile</Text>
              <AnimatedPressable onPress={openSettings} style={s.iconBtn}>
                <Settings size={24} color={COLORS.charcoal} strokeWidth={2.5} />
              </AnimatedPressable>
            </View>
          </View>
        

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 90 }}>
          {/* User Info Card */}
          
            <View>
              <View style={[s.userInfoCard, { backgroundColor: COLORS.white, borderColor: COLORS.bone }]}>
                <View style={[s.avatarSmall, { backgroundColor: COLORS.charcoal }]}>
                  <Text style={[s.avatarTextSmall, { color: COLORS.bg }]}>{initial}</Text>
                </View>
                <View style={s.userInfoTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.userNameText, { color: COLORS.charcoal }]}>{displayName}</Text>
                    {!isAuthenticated && (
                      <AnimatedPressable onPress={() => { setEditNameValue(displayName); setIsEditingName(true); }} style={{ paddingHorizontal: 8 }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.warmgray }}>Edit</Text>
                      </AnimatedPressable>
                    )}
                  </View>
                  <Text style={[s.userEmailText, { color: COLORS.warmgray }]}>{displayEmail}</Text>
                </View>
              </View>
            </View>
          

          {/* Edit Name Modal */}
          <Modal visible={isEditingName} transparent animationType="fade">
            <View style={s.modalOverlayCenter}>
              <View style={[s.editNameCard, { backgroundColor: COLORS.white, borderColor: COLORS.bone }]}>
                <Text style={[s.editNameTitle, { color: COLORS.charcoal }]}>Change Name</Text>
                <TextInput
                  style={[s.editNameInput, { color: COLORS.charcoal, borderBottomColor: COLORS.bone }]}
                  value={editNameValue}
                  onChangeText={setEditNameValue}
                  placeholder="Your Name"
                  placeholderTextColor={COLORS.warmgray}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24, gap: 16 }}>
                  <AnimatedPressable onPress={() => setIsEditingName(false)}>
                    <Text style={[s.editNameBtn, { color: COLORS.warmgray }]}>Cancel</Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={handleSaveName}>
                    <Text style={[s.editNameBtn, { color: COLORS.charcoal }]}>Save</Text>
                  </AnimatedPressable>
                </View>
              </View>
            </View>
          </Modal>

          {/* Reviews Completed Card */}
          
            <View>
              <View style={[s.reviewCard, { backgroundColor: COLORS.white, borderColor: COLORS.bone }]}>
                <View style={s.reviewCardLeft}>
                  <Text style={[s.reviewCardLabel, { color: COLORS.warmgray }]}>Reviews Completed</Text>
                  <Text style={[s.reviewCardValue, { color: COLORS.charcoal }]}>{totalReviews.toLocaleString()}</Text>
                </View>
                <View style={[s.trophyWrap, { backgroundColor: COLORS.lightgray }]}>
                  <Trophy size={24} color={COLORS.charcoal} strokeWidth={2} />
                </View>
              </View>
            </View>
          

          <View style={{ flex: 1 }} />

          {/* Sync & Auth Buttons */}
          
            <View>
              <View style={{ gap: 12, marginTop: 24 }}>
                {!isAuthenticated ? (
                <>
                  <Text style={[s.syncHint, { color: COLORS.warmgray }]}>
                    The app works fully offline. Create an account to sync your vocabulary across devices.
                  </Text>
                  <AnimatedPressable
                    onPress={() => router.push('/(auth)/login')}
                    style={[s.logoutBtn, { backgroundColor: COLORS.charcoal, borderColor: COLORS.charcoal, marginTop: 0 }]}
                  >
                    <Cloud size={20} color={COLORS.bg} strokeWidth={2.5} />
                    <Text style={[s.logoutText, { color: COLORS.bg }]}>Create account for sync</Text>
                  </AnimatedPressable>
                </>
              ) : (
                <>
                  <Text style={[s.syncHint, { color: COLORS.warmgray }]}>
                    Synced as {user?.email}
                    {lastSynced ? `\nLast synced: ${lastSynced}` : '\nNot synced yet'}
                  </Text>
                  {syncMessage ? (
                    <Text style={[s.syncHint, { color: COLORS.charcoal }]}>{syncMessage}</Text>
                  ) : null}
                  <AnimatedPressable
                    onPress={handleSyncNow}
                    disabled={isSyncing}
                    style={[s.logoutBtn, { backgroundColor: COLORS.charcoal, borderColor: COLORS.charcoal, marginTop: 0, opacity: isSyncing ? 0.7 : 1 }]}
                  >
                    <RefreshCw size={20} color={COLORS.bg} strokeWidth={2.5} />
                    <Text style={[s.logoutText, { color: COLORS.bg }]}>
                      {isSyncing ? 'Syncing…' : 'Sync now'}
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={handleLogout} style={[s.logoutBtn, { backgroundColor: COLORS.card, borderColor: COLORS.bone, marginTop: 0 }]}>
                    <LogOut size={20} color={COLORS.charcoal} strokeWidth={2.5} />
                    <Text style={[s.logoutText, { color: COLORS.charcoal }]}>Logout</Text>
                  </AnimatedPressable>
                </>
              )}
            </View>
          </View>
          
        </ScrollView>

        {/* ========== SETTINGS MODAL ========== */}
        <Modal visible={isSettingsVisible} transparent={true} onRequestClose={closeSettings}>
          <View style={s.modalOverlay}>
            <Animated.View style={[s.settingsDrawer, { backgroundColor: COLORS.bg }, animatedStyle]}>
              <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={[s.modalHeader, { borderBottomColor: COLORS.bone }]}>
                  <View style={{ width: 24 }} />
                  <Text style={[s.modalTitle, { color: COLORS.charcoal }]}>Settings</Text>
                  <AnimatedPressable onPress={closeSettings}>
                    <X size={24} color={COLORS.charcoal} />
                  </AnimatedPressable>
                </View>

                <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
                  {/* Appearance */}
                  <Text style={[s.sectionTitle, { color: COLORS.charcoal }]}>Appearance</Text>
                  <View style={[s.settingCard, { backgroundColor: COLORS.white, borderColor: COLORS.bone }]}>
                    <Text style={[s.settingLabel, { color: COLORS.charcoal }]}>Theme</Text>
                    <Text style={[s.settingSub, { color: COLORS.warmgray }]}>Choose your preferred theme</Text>
                    <View style={s.themeRow}>
                      <AnimatedPressable
                        onPress={() => setIsDarkMode(false)}
                        style={[s.themeBtn, { borderColor: COLORS.bone }, !isDarkMode && { borderColor: COLORS.charcoal, backgroundColor: COLORS.charcoal }]}
                      >
                        <Text style={[s.themeBtnText, { color: COLORS.charcoal }, !isDarkMode && { color: COLORS.bg }]}>Light</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => setIsDarkMode(true)}
                        style={[s.themeBtn, { borderColor: COLORS.bone }, isDarkMode && { borderColor: COLORS.charcoal, backgroundColor: COLORS.charcoal }]}
                      >
                        <Text style={[s.themeBtnText, { color: COLORS.charcoal }, isDarkMode && { color: COLORS.bg }]}>Dark</Text>
                      </AnimatedPressable>
                    </View>
                  </View>

                  {/* Notification */}
                  <Text style={[s.sectionTitle, { color: COLORS.charcoal, marginTop: 28 }]}>Notification</Text>
                  <View style={[s.settingCard, { backgroundColor: COLORS.white, borderColor: COLORS.bone }]}>
                    <View style={s.notifRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.settingLabel, { color: COLORS.charcoal }]}>Daily Reminder Time</Text>
                        <Text style={[s.settingSub, { color: COLORS.warmgray }]}>Set the time for your daily review reminder</Text>
                      </View>
                    </View>

                    <AnimatedPressable onPress={openTimePicker} style={[s.timePickerBtn, { backgroundColor: COLORS.card, borderColor: COLORS.bone }]}>
                      <Clock size={18} color={COLORS.charcoal} />
                      <Text style={[s.timePickerBtnText, { color: COLORS.charcoal }]}>
                        {formatTimeForDisplay(user?.notificationTime || guestNotificationTime)}
                      </Text>
                      <ChevronRight size={18} color={COLORS.warmgray} style={{ marginLeft: 'auto' }} />
                    </AnimatedPressable>
                  </View>
                  <View style={{ height: 32 }} />
                </ScrollView>
              </SafeAreaView>
            </Animated.View>
          </View>
        </Modal>

        {/* ========== TIME PICKER MODAL (Unnested for Android reliability) ========== */}
        {showTimePicker && (
          <Modal transparent={true} visible={showTimePicker} animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <View style={[s.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
                <View style={[s.clockModalContainer, { backgroundColor: COLORS.bg }]}>
                  <AnalogClockPicker
                    initialTime={tempTime24}
                    onTimeChange={setTempTime24}
                    isDarkMode={isDarkMode}
                  />
                  <View style={s.clockModalActions}>
                    <AnimatedPressable style={s.clockCancelBtn} onPress={() => setShowTimePicker(false)}>
                      <Text style={[s.clockBtnText, { color: COLORS.warmgray }]}>Cancel</Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={[s.clockConfirmBtn, { backgroundColor: COLORS.charcoal }]} onPress={confirmTimeSelection}>
                      <Check size={18} color={COLORS.bg} style={{ marginRight: 6 }} />
                      <Text style={[s.clockBtnText, { color: COLORS.bg }]}>Save Time</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              </View>
            </GestureHandlerRootView>
          </Modal>
        )}

        {/* ========== LOGOUT OPTIONS MODAL ========== */}
        {isLogoutModalVisible && (
          <Modal
            transparent={true}
            visible={isLogoutModalVisible}
            animationType="fade"
            onRequestClose={() => !isLoggingOut && setIsLogoutModalVisible(false)}
          >
            <View style={s.modalOverlayCenter}>
              <View style={[s.logoutDialogCard, { backgroundColor: COLORS.white, borderColor: COLORS.bone }]}>
                <View style={s.logoutDialogHeader}>
                  <Text style={[s.logoutDialogTitle, { color: COLORS.charcoal }]}>Log Out</Text>
                  <AnimatedPressable disabled={isLoggingOut} onPress={() => setIsLogoutModalVisible(false)} style={s.logoutCloseBtn}>
                    <X size={20} color={COLORS.warmgray} />
                  </AnimatedPressable>
                </View>

                <Text style={[s.logoutDialogSubtitle, { color: COLORS.warmgray }]}>
                  Your vocabulary is safely backed up to your account. Choose what you want to do with the words stored on this device:
                </Text>

                {/* Option 1: Keep Words on Device */}
                <AnimatedPressable
                  disabled={isLoggingOut}
                  onPress={() => executeLogout(false)}
                  style={[s.logoutOptionCard, { backgroundColor: COLORS.card, borderColor: COLORS.bone }]}
                  activeOpacity={0.7}
                >
                  <View style={[s.logoutOptionIcon, { backgroundColor: COLORS.bg }]}>
                    {isKeepingData ? (
                      <ActivityIndicator size="small" color={COLORS.charcoal} />
                    ) : (
                      <Smartphone size={22} color={COLORS.charcoal} strokeWidth={2} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.logoutOptionTitle, { color: COLORS.charcoal }]}>
                      {isKeepingData ? 'Logging out…' : 'Keep Words on Device'}
                    </Text>
                    <Text style={[s.logoutOptionDesc, { color: COLORS.warmgray }]}>
                      Log out and continue studying your words offline in guest mode.
                    </Text>
                  </View>
                </AnimatedPressable>

                {/* Option 2: Clear Words from Device */}
                <AnimatedPressable
                  disabled={isLoggingOut}
                  onPress={() => executeLogout(true)}
                  style={[s.logoutOptionCard, { backgroundColor: isDarkMode ? '#2B1515' : '#FEF2F2', borderColor: isDarkMode ? '#5C1D1D' : '#FECACA' }]}
                  activeOpacity={0.7}
                >
                  <View style={[s.logoutOptionIcon, { backgroundColor: isDarkMode ? '#3D1B1B' : '#FEE2E2' }]}>
                    {isClearingData ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Trash2 size={22} color="#EF4444" strokeWidth={2} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.logoutOptionTitle, { color: '#EF4444' }]}>
                      {isClearingData ? 'Clearing data…' : 'Clear Words from Device'}
                    </Text>
                    <Text style={[s.logoutOptionDesc, { color: isDarkMode ? '#FCA5A5' : '#991B1B' }]}>
                      Wipe local storage on this phone. Recommended for shared or public devices.
                    </Text>
                  </View>
                </AnimatedPressable>

                <AnimatedPressable
                  disabled={isLoggingOut}
                  onPress={() => setIsLogoutModalVisible(false)}
                  style={[s.cancelBtn, { borderColor: COLORS.bone, backgroundColor: COLORS.bg }]}
                >
                  <Text style={[s.cancelBtnText, { color: COLORS.charcoal }]}>Cancel</Text>
                </AnimatedPressable>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any, SCREEN_WIDTH: number) => StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: COLORS.charcoal },
  iconBtn: { padding: 8 },

  // Combined User Info Card
  userInfoCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16,
    borderWidth: 1, marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarSmall: {
    width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 16,
  },
  avatarTextSmall: { fontFamily: 'Outfit_700Bold', fontSize: 24 },
  userInfoTextWrap: { flex: 1, justifyContent: 'center' },
  userNameText: { fontFamily: 'Outfit_700Bold', fontSize: 20, marginBottom: 4 },
  userEmailText: { fontFamily: 'Inter_400Regular', fontSize: 14 },

  // Review card
  reviewCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 16,
    borderWidth: 1, marginBottom: 32, marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  reviewCardLeft: { flex: 1, marginRight: 16 },
  reviewCardLabel: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  reviewCardValue: { fontFamily: 'Outfit_700Bold', fontSize: 26, marginTop: 4 },
  trophyWrap: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 24, borderWidth: 1,
    paddingVertical: 18, gap: 12, marginTop: 24,
  },
  logoutText: { fontFamily: 'Inter_500Medium', fontSize: 16 },
  syncHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Settings Drawer
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  settingsDrawer: {
    width: SCREEN_WIDTH,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24 },
  sectionTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, marginBottom: 12, marginTop: 24 },
  settingCard: {
    borderRadius: 16, padding: 20,
    borderWidth: 1, marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  settingLabel: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  settingSub: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },

  // Theme
  themeRow: { flexDirection: 'row', marginTop: 16, gap: 12 },
  themeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, alignItems: 'center',
  },
  themeBtnText: { fontFamily: 'Inter_500Medium', fontSize: 14 },

  // Notification
  notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  timePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1,
  },
  timePickerBtnText: { fontFamily: 'Inter_500Medium', fontSize: 16 },

  // Clock Modal
  clockModalContainer: {
    width: '90%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  clockModalActions: {
    flexDirection: 'row',
    marginTop: 32,
    width: '100%',
    justifyContent: 'flex-end',
    gap: 12,
  },
  clockCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  clockConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  clockBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  
  // Edit Name Modal
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  editNameCard: { width: '100%', borderRadius: 24, padding: 24, borderWidth: 1 },
  editNameTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, marginBottom: 16 },
  editNameInput: { fontFamily: 'Inter_500Medium', fontSize: 16, paddingVertical: 12, borderBottomWidth: 1, marginBottom: 8 },
  editNameBtn: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },

  // Logout Modal
  logoutDialogCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  logoutDialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logoutDialogTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
  },
  logoutCloseBtn: {
    padding: 4,
  },
  logoutDialogSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  logoutOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  logoutOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutOptionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    marginBottom: 2,
  },
  logoutOptionDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
