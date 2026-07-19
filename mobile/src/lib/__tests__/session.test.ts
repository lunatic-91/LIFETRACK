import * as SecureStore from 'expo-secure-store';

import { saveSession, getAccessToken, hasActiveSession, clearSession } from '../session';

describe('session storage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('saveSession stores both tokens', async () => {
    await saveSession({ accessToken: 'a', refreshToken: 'r' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lifetrack.accessToken', 'a');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lifetrack.refreshToken', 'r');
  });

  test('hasActiveSession is true when an access token exists', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('some-token');
    await expect(hasActiveSession()).resolves.toBe(true);
  });

  test('hasActiveSession is false when no access token exists', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await expect(hasActiveSession()).resolves.toBe(false);
  });

  test('getAccessToken returns whatever SecureStore returns', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('xyz');
    await expect(getAccessToken()).resolves.toBe('xyz');
  });

  test('clearSession deletes both tokens', async () => {
    await clearSession();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lifetrack.accessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lifetrack.refreshToken');
  });
});
