import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getWords, clearAllLocalData } from '../db/queries';
import { initDB } from '../db/database';

const safeStorage = {
  setItemAsync: async (key: string, value: string) => {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  getItemAsync: async (key: string) => {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  deleteItemAsync: async (key: string) => {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

export interface Word {
  id: string;
  word: string;
  meaning: string;
  dateAdded: string;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsLapses: number;
  fsrsReps: number;
  fsrsState: string;
  lastReview: string | null;
  nextReview: string;
  reviewCount: number;
  isDraft?: boolean;
}

export interface LocalWord {
  word: string;
  meaning: string;
  dateAdded?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  notificationTime: string;
}

interface AppState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  words: Word[]; // Master list (sourced from SQLite)
  
  guestName: string | null;
  hasCompletedOnboarding: boolean;
  
  isTabBarHidden: boolean;
  isDarkMode: boolean;
  draftVocabLines: LocalWord[];
  guestNotificationTime: string;
  
  setAuth: (token: string, user: User) => Promise<void>;
  clearAuth: (clearLocalData?: boolean) => Promise<void>;
  
  // Refreshes the `words` state array with the latest data from the local SQLite db
  loadLocalDatabase: () => Promise<void>;
  
  setGuestName: (name: string) => Promise<void>;
  setHasCompletedOnboarding: (val: boolean) => Promise<void>;
  
  checkFirstLaunch: () => Promise<void>;
  updateNotificationTime: (time: string) => Promise<void>;
  setIsTabBarHidden: (hidden: boolean) => void;
  setIsDarkMode: (isDark: boolean) => Promise<void>;
  setDraftVocabLines: (lines: LocalWord[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  words: [],
  
  guestName: null,
  hasCompletedOnboarding: false,
  
  isTabBarHidden: false,
  isDarkMode: false,
  draftVocabLines: Array(5).fill(null).map(() => ({ word: '', meaning: '' })),
  guestNotificationTime: '16:00',

  setAuth: async (token, user) => {
    const userWithDefaults = { ...user, notificationTime: user.notificationTime ?? '09:00' };
    await safeStorage.setItemAsync('auth_token', token);
    await safeStorage.setItemAsync('auth_user', JSON.stringify(userWithDefaults));
    set({ token, user: userWithDefaults, isAuthenticated: true });
  },

  clearAuth: async (clearLocalData: boolean = false) => {
    await safeStorage.deleteItemAsync('auth_token');
    await safeStorage.deleteItemAsync('auth_user');
    if (clearLocalData) {
      await clearAllLocalData();
      set({ token: null, user: null, isAuthenticated: false, words: [] });
    } else {
      set({ token: null, user: null, isAuthenticated: false });
    }
  },

  loadLocalDatabase: async () => {
    try {
      const allWords = await getWords();
      set({ words: allWords });
    } catch (e) {
      console.error('Failed to load words from SQLite', e);
    }
  },
  
  setGuestName: async (name) => {
    await AsyncStorage.setItem('guest_name', name);
    set({ guestName: name });
  },
  
  setHasCompletedOnboarding: async (val) => {
    await AsyncStorage.setItem('has_completed_onboarding', val ? 'true' : 'false');
    set({ hasCompletedOnboarding: val });
  },

  checkFirstLaunch: async () => {
    try {
      await initDB();
      const token = await safeStorage.getItemAsync('auth_token');
      const userStr = await safeStorage.getItemAsync('auth_user');
      const guestName = await AsyncStorage.getItem('guest_name');
      const hasCompletedOnboarding = await AsyncStorage.getItem('has_completed_onboarding') === 'true';

      if (token && userStr) {
        set({
          token,
          user: JSON.parse(userStr),
          isAuthenticated: true,
          guestName,
          hasCompletedOnboarding
        });
      } else {
        set({ guestName, hasCompletedOnboarding });
      }
      
      // Attempt to load SQLite db into state
      await get().loadLocalDatabase();
      
    } catch (e) {
      console.error('Failed to load app state', e);
    } finally {
      try {
        const darkStr = await safeStorage.getItemAsync('is_dark_mode');
        if (darkStr !== null) {
          set({ isDarkMode: darkStr === 'true' });
        }
        const guestTimeStr = await safeStorage.getItemAsync('guest_notification_time');
        if (guestTimeStr) {
          set({ guestNotificationTime: guestTimeStr });
        }
      } catch {}
      set({ isLoading: false });
    }
  },

  updateNotificationTime: async (time) => {
    const user = get().user;
    if (user) {
      const updatedUser = { ...user, notificationTime: time };
      await safeStorage.setItemAsync('auth_user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
    } else {
      await safeStorage.setItemAsync('guest_notification_time', time);
      set({ guestNotificationTime: time });
    }
  },

  setIsTabBarHidden: (hidden) => set({ isTabBarHidden: hidden }),
  
  setIsDarkMode: async (isDark) => {
    await safeStorage.setItemAsync('is_dark_mode', isDark ? 'true' : 'false');
    set({ isDarkMode: isDark });
  },
  
  setDraftVocabLines: (lines) => set({ draftVocabLines: lines })
}));
