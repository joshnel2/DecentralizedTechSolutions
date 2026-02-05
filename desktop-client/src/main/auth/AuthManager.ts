/**
 * Apex Drive Authentication Manager
 * 
 * Handles secure storage and retrieval of authentication tokens.
 * Uses electron-store with encryption for credential storage.
 */

import log from 'electron-log';
import Store from 'electron-store';
import { safeStorage } from 'electron';

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

    // Use Electron's safeStorage if available (encrypts data)
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const encryptedToken = safeStorage.encryptString(token).toString('base64');
        const encryptedRefresh = safeStorage.encryptString(refreshToken).toString('base64');
        this.store.set('authTokenEncrypted', encryptedToken);
        this.store.set('authRefreshTokenEncrypted', encryptedRefresh);
        this.store.delete('authToken');
        this.store.delete('authRefreshToken');
        log.info('Auth tokens saved with encryption');
        return;
      } catch (error) {
        log.error('Failed to encrypt tokens, using plain storage:', error);
      }
    }

    // Fallback to plain storage
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

    // Try encrypted storage first
    const encryptedToken = this.store.get('authTokenEncrypted') as string | undefined;
    if (encryptedToken && safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'));
        this.cachedToken = decrypted;
        return decrypted;
      } catch (error) {
        log.error('Failed to decrypt token:', error);
      }
    }

    // Fallback to plain storage
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

    // Try encrypted storage first
    const encryptedRefresh = this.store.get('authRefreshTokenEncrypted') as string | undefined;
    if (encryptedRefresh && safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(encryptedRefresh, 'base64'));
        this.cachedRefreshToken = decrypted;
        return decrypted;
      } catch (error) {
        log.error('Failed to decrypt refresh token:', error);
      }
    }

    // Fallback to plain storage
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

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const encryptedToken = safeStorage.encryptString(token).toString('base64');
        this.store.set('authTokenEncrypted', encryptedToken);
        return;
      } catch (error) {
        log.error('Failed to encrypt updated token:', error);
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
    this.store.delete('authTokenEncrypted');
    this.store.delete('authRefreshTokenEncrypted');
    this.store.delete('authExpiresAt');
    
    log.info('Auth tokens cleared');
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
