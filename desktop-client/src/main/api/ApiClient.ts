/**
 * Apex Drive API Client
 * 
 * Communicates with the Apex backend server for:
 * - Authentication
 * - Matter/file listing
 * - File operations (download, upload, create, delete)
 * - Real-time sync via WebSocket
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import log from 'electron-log';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

// API Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  firmId: string;
  firmName: string;
}

export interface Matter {
  id: string;
  name: string;
  number: string | null;
  description: string | null;
  status: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface VirtualFile {
  id: string;
  name: string;
  path: string;
  azurePath?: string;
  size: number;
  type: string;
  isFolder: boolean;
  matterId?: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string | null;
  children?: VirtualFile[];
}

export interface VirtualFolder {
  id: string;
  name: string;
  path: string;
  matterId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresIn?: number;
}

// Alias for compatibility
export type { LoginResponse as AuthResponse };

export interface CreateFileResponse {
  documentId: string;
  azurePath: string;
  name: string;
}

export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'rename' | 'move';
  documentId: string;
  matterId: string;
  path: string;
  oldPath?: string;
  timestamp: string;
}

export class ApiClient extends EventEmitter {
  private httpClient: AxiosInstance;
  private wsClient: WebSocket | null = null;
  private token: string | null = null;
  private serverUrl: string;
  private wsConnected: boolean = false;
  private httpConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3; // Reduced since WebSocket may not be available
  private reconnectDelay: number = 2000;

  constructor(serverUrl: string, token?: string | null) {
    super();
    this.serverUrl = serverUrl;
    this.token = token || null;

    this.httpClient = axios.create({
      baseURL: `${serverUrl}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth header interceptor
    this.httpClient.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Add response error interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        // Successful HTTP response means we're connected
        this.httpConnected = true;
        return response;
      },
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.emit('unauthorized');
        }
        throw error;
      }
    );

    // Try to connect WebSocket if we have a token (optional - server may not support it)
    if (this.token) {
      this.tryConnectWebSocket();
    }
  }

  public setToken(token: string): void {
    this.token = token;
    this.httpConnected = true; // If we have a token, assume HTTP works
    this.tryConnectWebSocket();
  }

  /**
   * Check if connected - HTTP connection is sufficient, WebSocket is optional
   */
  public isConnected(): boolean {
    return this.httpConnected || this.wsConnected;
  }

  /**
   * Check if WebSocket is connected (for real-time features)
   */
  public isWebSocketConnected(): boolean {
    return this.wsConnected;
  }

  /**
   * Mark HTTP as connected (called after successful login)
   */
  public setHttpConnected(connected: boolean): void {
    this.httpConnected = connected;
  }

  /**
   * Try to connect to WebSocket for real-time updates (optional feature)
   * If the server doesn't support WebSocket, HTTP-only mode works fine
   */
  private tryConnectWebSocket(): void {
    if (this.wsClient) {
      this.wsClient.close();
    }

    const wsUrl = this.serverUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    try {
      this.wsClient = new WebSocket(`${wsUrl}/ws/drive`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      this.wsClient.on('open', () => {
        log.info('WebSocket connected (real-time updates enabled)');
        this.wsConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
      });

      this.wsClient.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          log.error('Failed to parse WebSocket message:', error);
        }
      });

      this.wsClient.on('close', () => {
        log.debug('WebSocket disconnected');
        this.wsConnected = false;
        // Don't emit disconnected - HTTP is still working
        this.scheduleReconnect();
      });

      this.wsClient.on('error', (error) => {
        // WebSocket is optional - log but don't treat as critical
        log.debug('WebSocket not available (server may not support it):', (error as Error).message);
        this.wsConnected = false;
      });
    } catch (error) {
      // WebSocket is optional - just log and continue
      log.debug('WebSocket connection failed (using HTTP-only mode)');
      this.wsConnected = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.debug('WebSocket reconnect attempts exhausted, continuing with HTTP-only mode');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    log.debug(`WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.tryConnectWebSocket();
    }, delay);
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'fileChanged':
        this.emit('fileChanged', message.data as FileOperation);
        break;
      case 'matterChanged':
        this.emit('matterChanged', message.matterId);
        break;
      case 'sync':
        this.emit('syncRequired', message.data);
        break;
      case 'ping':
        this.wsClient?.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        log.debug('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Close the API client
   */
  public close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    this.wsConnected = false;
    this.httpConnected = false;
  }

  // Authentication

  public async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.httpClient.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    return response.data;
  }

  public async verifyToken(): Promise<User> {
    const response = await this.httpClient.get<User>('/auth/me');
    return response.data;
  }

  public async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const response = await this.httpClient.post<LoginResponse>('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  }

  // Matters

  public async getMatters(): Promise<Matter[]> {
    const response = await this.httpClient.get<{ matters: Matter[] }>('/matters');
    return response.data.matters || [];
  }

  public async getMatter(matterId: string): Promise<Matter> {
    const response = await this.httpClient.get<Matter>(`/matters/${matterId}`);
    return response.data;
  }

  // Files

  public async listFiles(matterId: string, folderPath?: string): Promise<VirtualFile[]> {
    const response = await this.httpClient.get<{ files: VirtualFile[] }>(
      `/drive/matters/${matterId}/files`,
      { params: { path: folderPath } }
    );
    return response.data.files || [];
  }

  public async downloadFile(documentId: string): Promise<Buffer> {
    const response = await this.httpClient.get(`/drive/files/${documentId}/download`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  public async uploadFile(
    documentId: string,
    content: Buffer
  ): Promise<{ success: boolean; size: number }> {
    const response = await this.httpClient.put(`/drive/files/${documentId}/upload`, content, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
    return response.data;
  }

  public async createFile(
    matterId: string,
    fileName: string,
    folderPath: string
  ): Promise<CreateFileResponse> {
    const response = await this.httpClient.post<CreateFileResponse>(
      `/drive/matters/${matterId}/files`,
      { name: fileName, path: folderPath }
    );
    return response.data;
  }

  public async deleteFile(documentId: string): Promise<void> {
    await this.httpClient.delete(`/drive/files/${documentId}`);
  }

  public async renameFile(documentId: string, newName: string): Promise<void> {
    await this.httpClient.patch(`/drive/files/${documentId}`, { name: newName });
  }

  public async moveFile(documentId: string, newPath: string): Promise<void> {
    await this.httpClient.patch(`/drive/files/${documentId}`, { path: newPath });
  }

  // Folders

  public async createFolder(
    matterId: string,
    folderName: string,
    parentPath: string
  ): Promise<{ folderId: string; path: string }> {
    const response = await this.httpClient.post(`/drive/matters/${matterId}/folders`, {
      name: folderName,
      path: parentPath,
    });
    return response.data;
  }

  public async deleteFolder(matterId: string, folderPath: string): Promise<void> {
    await this.httpClient.delete(`/drive/matters/${matterId}/folders`, {
      data: { path: folderPath },
    });
  }

  public async renameFolder(
    matterId: string,
    oldPath: string,
    newPath: string
  ): Promise<void> {
    await this.httpClient.patch(`/drive/matters/${matterId}/folders`, {
      oldPath,
      newPath,
    });
  }

  // Sync

  public async getSyncStatus(): Promise<{
    lastSync: string | null;
    pendingChanges: number;
    syncInProgress: boolean;
  }> {
    const response = await this.httpClient.get('/drive/sync/status');
    return response.data;
  }

  public async getChanges(since: string): Promise<FileOperation[]> {
    const response = await this.httpClient.get<{ changes: FileOperation[] }>('/drive/sync/changes', {
      params: { since },
    });
    return response.data.changes || [];
  }

  public async reportLocalChanges(changes: FileOperation[]): Promise<void> {
    await this.httpClient.post('/drive/sync/changes', { changes });
  }

  // Desktop client specific endpoints

  public async registerDesktopClient(clientInfo: {
    deviceName: string;
    platform: string;
    version: string;
  }): Promise<{ clientId: string }> {
    const response = await this.httpClient.post('/drive/desktop/register', clientInfo);
    return response.data;
  }

  public async heartbeat(clientId: string): Promise<void> {
    await this.httpClient.post(`/drive/desktop/${clientId}/heartbeat`);
  }

  public async deregisterDesktopClient(clientId: string): Promise<void> {
    await this.httpClient.delete(`/drive/desktop/${clientId}`);
  }
}
