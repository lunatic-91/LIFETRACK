import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'lifetrack.accessToken';
const REFRESH_TOKEN_KEY = 'lifetrack.refreshToken';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveSession(tokens: SessionTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function hasActiveSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
