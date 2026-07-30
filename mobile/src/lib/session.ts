import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'lifetrack.accessToken';
const REFRESH_TOKEN_KEY = 'lifetrack.refreshToken';

const isWeb = Platform.OS === 'web';

// expo-secure-store relies on the native iOS/Android keychain and has no
// implementation on web. On web we fall back to localStorage so the app
// doesn't crash with "getValueWithKeyAsync is not a function".
const webStorage = {
  async setItemAsync(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
  async getItemAsync(key: string): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  },
};

const storage = isWeb ? webStorage : SecureStore;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveSession(tokens: SessionTokens): Promise<void> {
  await Promise.all([
    storage.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    storage.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return storage.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return storage.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function hasActiveSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    storage.deleteItemAsync(ACCESS_TOKEN_KEY),
    storage.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
