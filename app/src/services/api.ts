import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAppStore } from '../store/useAppStore';

function getBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // In development with Expo Go, dynamically detect the host machine's IP address
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8080`;
  }

  return 'https://wordroot-git-238664083379.europe-west1.run.app';
}

const BASE_URL = getBaseUrl();

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = useAppStore.getState().refreshToken;
  if (!refreshToken) {
    await useAppStore.getState().clearAuth();
    return null;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      await useAppStore.getState().clearAuth();
      return null;
    }

    const data = await res.json();
    if (data.accessToken) {
      await useAppStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    } else {
      await useAppStore.getState().clearAuth();
      return null;
    }
  } catch {
    return null;
  }
}

async function request(endpoint: string, options: RequestInit = {}, isRetry: boolean = false): Promise<any> {
  const token = useAppStore.getState().token;

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Cannot reach server. Please check your network connection or server status.');
  }

  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  // Auto-refresh access token on 401 response from server
  if (
    response.status === 401 &&
    !isRetry &&
    !endpoint.startsWith('/api/auth/login') &&
    !endpoint.startsWith('/api/auth/register') &&
    !endpoint.startsWith('/api/auth/refresh')
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = performTokenRefresh().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const newAccessToken = await refreshPromise;
    if (newAccessToken) {
      // Retry original request with the updated access token
      return request(endpoint, options, true);
    }
  }

  if (!response.ok) {
    let msg = data.error || data.message;
    // If the server returned an HTML error page (e.g. 404/502), show a friendly message
    if (typeof msg === 'string' && (msg.includes('<html') || msg.includes('<!DOCTYPE') || msg.length > 200)) {
      msg = `Server returned status ${response.status} (${response.statusText || 'Error'}).`;
    }
    throw new Error(msg || 'Something went wrong');
  }

  return data;
}

export const api = {
  auth: {
    register: (body: any) =>
      request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: any) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    google: (body: any) =>
      request('/api/auth/google', { method: 'POST', body: JSON.stringify(body) }),
    refresh: (refreshToken: string) =>
      request('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
    logout: (refreshToken?: string | null) =>
      request('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
    forgotPassword: (body: { email: string }) =>
      request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
    resetPassword: (body: { email: string; code: string; newPassword: string }) =>
      request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
    deleteAccount: () =>
      request('/api/auth/account', { method: 'DELETE' }),
  },

  words: {
    getAll: async (batchSize = 500) => {
      let allWords: any[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const queryParams = new URLSearchParams({
          limit: String(batchSize),
          paginated: 'true',
          ...(cursor ? { cursor } : {}),
        }).toString();

        const response: any = await request(`/api/words?${queryParams}`);
        if (Array.isArray(response)) {
          allWords = response;
          break;
        }

        const words = response.words || [];
        allWords.push(...words);
        hasMore = Boolean(response.hasMore && response.nextCursor);
        cursor = response.nextCursor;
      }

      return allWords;
    },
  },

  sync: {
    push: (syncQueue: unknown[]) =>
      request('/api/sync', { method: 'POST', body: JSON.stringify({ syncQueue }) }),
  },
};
