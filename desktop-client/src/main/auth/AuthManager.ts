/**
 * Apex Drive Authentication Manager
 * 
 * Handles secure storage and retrieval of authentication tokens.
 * Uses the system keychain for secure credential storage.
 */

import log from 'electron-log';
import Store from 'electron-store';

// Keytar is used for secure credential storage in the system keychain
// Falls back to encrypted store if keytar is not available
let keytar: typeof import('keytar') | null = null;
try {
  keytar = require('keytar');
} catch {
  log.warn('Keytar not available, using encrypted store for credentials');
}

const SERVICE_NAME = 'ApexDrive';
const ACCOUNT_NAME = 'auth';

interface AuthData {
  token: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
}

export class AuthManager {
  private store: Store;
  private cachedToken: string | null = null;
  private cachedRefreshToken: string | null = null;

  constructor(store: Store) {
    this.store = store;
  }

  /**
   * Check if user is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) {
      return false;
    }

    // Check if token is expired
    const expiresAt = this.store.get('authExpiresAt') as number | undefined;
    if (expiresAt && Date.now() > expiresAt) {
      // Token expired, try to refresh
      const refreshToken = await this.getRefreshToken();
      if (refreshToken) {
        // Token refresh will be handled by the ApiClient
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Save authentication tokens
   */
  public async saveToken(token: string, refreshToken: string, expiresIn?: number): Promise<void> {
    this.cachedToken = token;
    this.cachedRefreshToken = refreshToken;

    // Calculate expiration time
    const expiresAt = expiresIn 
      ? Date.now() + (expiresIn * 1000)
      : Date.now() + (24 * 60 * 60 * 1000); // Default 24 hours

    this.store.set('authExpiresAt', expiresAt);

    if (keytar) {
      try {
        // Store in system keychain
        await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify({
          token,
          refreshToken,
          expiresAt,
        }));
        log.info('Auth tokens saved to system keychain');
        return;
      } catch (error) {
        log.error('Failed to save to keychain, using encrypted store:', error);
      }
    }

    // Fallback to encrypted store
    this.store.set('authToken', token);
    this.store.set('authRefreshToken', refreshToken);
  }

  /**
   * Get the current access token
   */
  public async getToken(): Promise<string | null> {
    if (this.cachedToken) {
      return this.cachedToken;
    }

    if (keytar) {
      try {
        const stored = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        if (stored) {
          const data = JSON.parse(stored) as AuthData;
          this.cachedToken = data.token;
          this.cachedRefreshToken = data.refreshToken;
          return data.token;
        }
      } catch (error) {
        log.error('Failed to read from keychain:', error);
      }
    }

    // Fallback to encrypted store
    const token = this.store.get('authToken') as string | undefined;
    if (token) {
      this.cachedToken = token;
    }
    return token || null;
  }

  /**
   * Get the refresh token
   */
  public async getRefreshToken(): Promise<string | null> {
    if (this.cachedRefreshToken) {
      return this.cachedRefreshToken;
    }

    if (keytar) {
      try {
        const stored = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        if (stored) {
          const data = JSON.parse(stored) as AuthData;
          this.cachedRefreshToken = data.refreshToken;
          return data.refreshToken;
        }
      } catch (error) {
        log.error('Failed to read refresh token from keychain:', error);
      }
    }

    // Fallback to encrypted store
    return this.store.get('authRefreshToken') as string | null;
  }

  /**
   * Update the access token (after refresh)
   */
  public async updateToken(token: string, expiresIn?: number): Promise<void> {
    this.cachedToken = token;

    const expiresAt = expiresIn
      ? Date.now() + (expiresIn * 1000)
      : Date.now() + (24 * 60 * 60 * 1000);

    this.store.set('authExpiresAt', expiresAt);

    if (keytar) {
      try {
        const stored = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        if (stored) {
          const data = JSON.parse(stored) as AuthData;
          data.token = token;
          data.expiresAt = expiresAt;
          await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify(data));
          return;
        }
      } catch (error) {
        log.error('Failed to update token in keychain:', error);
      }
    }

    // Fallback
    this.store.set('authToken', token);
  }

  /**
   * Sign out and clear all stored credentials
   */
  public async signOut(): Promise<void> {
    this.cachedToken = null;
    this.cachedRefreshToken = null;

    this.store.delete('authToken');
    this.store.delete('authRefreshToken');
    this.store.delete('authExpiresAt');

    if (keytar) {
      try {
        await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
        log.info('Auth tokens cleared from keychain');
      } catch (error) {
        log.error('Failed to clear keychain:', error);
      }
    }
  }

  /**
   * Save user info
   */
  public saveUserInfo(user: { id: string; email: string; firstName: string; lastName: string }): void {
    this.store.set('userId', user.id);
    this.store.set('userEmail', user.email);
    this.store.set('userName', `${user.firstName} ${user.lastName}`);
  }

  /**
   * Get saved user info
   */
  public getUserInfo(): { id: string; email: string; name: string } | null {
    const id = this.store.get('userId') as string | undefined;
    const email = this.store.get('userEmail') as string | undefined;
    const name = this.store.get('userName') as string | undefined;

    if (id && email && name) {
      return { id, email, name };
    }
    return null;
  }
}
