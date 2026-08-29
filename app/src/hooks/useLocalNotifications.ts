import { useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;
if (!isExpoGo) {
  try {
// eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.log('Failed to setup expo-notifications', e);
  }
}

export function useLocalNotifications() {
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  const userNotificationTime = useAppStore((state) => state.user?.notificationTime);
  const guestNotificationTime = useAppStore((state) => state.guestNotificationTime);

  const scheduleDailyReminder = async () => {
    if (isExpoGo || !Notifications) return;

    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

      const timeString = userNotificationTime || guestNotificationTime || '09:00';
      const { hours, minutes } = parseNotificationTime(timeString);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Time for your daily review! 📚',
          body: 'You have pending vocabulary words waiting for you. Keep up the streak!',
          sound: true,
        },
        trigger: {
          hour: hours,
          minute: minutes,
          repeats: true,
        } as any,
      });
    } catch (e) {
      console.log('Error scheduling local notifications:', e);
    }
  };

  useEffect(() => {
    if (isExpoGo || !Notifications) return;

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});

    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isExpoGo || !Notifications) return;

    requestPermissionsAsync().then((granted) => {
      if (granted) {
        scheduleDailyReminder();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userNotificationTime, guestNotificationTime]);

}

function parseNotificationTime(rawTime?: string | null): { hours: number; minutes: number } {
  const defaultTime = { hours: 9, minutes: 0 };
  if (!rawTime || typeof rawTime !== 'string') return defaultTime;

  const trimmed = rawTime.trim();

  const match24h = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24h) {
    const hours = parseInt(match24h[1], 10);
    const minutes = parseInt(match24h[2], 10);
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    }
  }

  const match12h = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12h) {
    let hours = parseInt(match12h[1], 10);
    const minutes = parseInt(match12h[2], 10);
    const period = match12h[3].toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    }
  }

  return defaultTime;
}

async function requestPermissionsAsync() {
  if (isExpoGo || !Notifications) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted');
      return false;
    }
    return true;
  }

  return false;
}
