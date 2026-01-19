// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Token storage key
const TOKEN_STORAGE_KEY = 'apex-access-token';

// Token management - initialize from localStorage
let accessToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
})();

export function setAccessToken(token: string | null) {
  accessToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to persist access token:', error);
  }
}

export function getAccessToken() {
  return accessToken;
}

// API Error class
export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// Base fetch function with auth
async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<any> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // For cookies
  });

  // Handle token refresh on 401
  if (response.status === 401 && accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
      
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
        throw new ApiError(retryResponse.status, error.error || 'Request failed', error);
      }
      
      return retryResponse.json();
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, error.error || 'Request failed', error);
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Refresh token
async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      setAccessToken(data.accessToken);
      return true;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  
  // Clear token on refresh failure
  setAccessToken(null);
  return false;
}

// ============================================
// AUTH API
// ============================================

export const authApi = {
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    firmName?: string;
  }) {
    const result = await fetchWithAuth('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setAccessToken(result.accessToken);
    return result;
  },

  async login(email: string, password: string) {
    const result = await fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result.accessToken) {
      setAccessToken(result.accessToken);
    }
    return result;
  },

  async logout() {
    try {
      await fetchWithAuth('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },

  async getMe() {
    return fetchWithAuth('/auth/me');
  },

  async updatePassword(currentPassword: string, newPassword: string) {
    return fetchWithAuth('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async getSessions() {
    return fetchWithAuth('/auth/sessions');
  },

  async revokeSession(sessionId: string) {
    return fetchWithAuth(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  },

  async revokeAllSessions() {
    return fetchWithAuth('/auth/sessions', { method: 'DELETE' });
  },
};

// ============================================
// CLIENTS API
// ============================================

export const clientsApi = {
  async getAll(params?: { search?: string; type?: string; isActive?: boolean; view?: 'my' | 'all' }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.type) query.set('type', params.type);
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    if (params?.view) query.set('view', params.view);
    
    return fetchWithAuth(`/clients?${query}`);
  },

  async getById(id: string) {
    return fetchWithAuth(`/clients/${id}`);
  },

  async create(data: any) {
    return fetchWithAuth('/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchWithAuth(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/clients/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// MATTERS API
// ============================================

export const mattersApi = {
  async getAll(params?: { 
    search?: string; 
    status?: string; 
    type?: string;
    clientId?: string;
    priority?: string;
    view?: 'my' | 'all'; // 'my' = my matters only, 'all' = all matters I can see
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.view) query.set('view', params.view);
    
    return fetchWithAuth(`/matters?${query}`);
  },

  async getById(id: string) {
    return fetchWithAuth(`/matters/${id}`);
  },

  async create(data: any) {
    return fetchWithAuth('/matters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchWithAuth(`/matters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/matters/${id}`, { method: 'DELETE' });
  },

  // Tasks
  async getTasks(matterId: string) {
    return fetchWithAuth(`/matters/${matterId}/tasks`);
  },

  async createTask(matterId: string, data: { name: string; description?: string; status?: string; priority?: string; dueDate?: string; assignee?: string }) {
    return fetchWithAuth(`/matters/${matterId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTask(matterId: string, taskId: string, data: any) {
    return fetchWithAuth(`/matters/${matterId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTask(matterId: string, taskId: string) {
    return fetchWithAuth(`/matters/${matterId}/tasks/${taskId}`, { method: 'DELETE' });
  },

  // Updates
  async getUpdates(matterId: string) {
    return fetchWithAuth(`/matters/${matterId}/updates`);
  },

  async createUpdate(matterId: string, data: { date: string; title: string; description: string; category?: string }) {
    return fetchWithAuth(`/matters/${matterId}/updates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateUpdate(matterId: string, updateId: string, data: any) {
    return fetchWithAuth(`/matters/${matterId}/updates/${updateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteUpdate(matterId: string, updateId: string) {
    return fetchWithAuth(`/matters/${matterId}/updates/${updateId}`, { method: 'DELETE' });
  },

  // Contacts
  async getContacts(matterId: string) {
    return fetchWithAuth(`/matters/${matterId}/contacts`);
  },

  async createContact(matterId: string, data: { name: string; role?: string; firm?: string; email?: string; phone?: string; notes?: string }) {
    return fetchWithAuth(`/matters/${matterId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateContact(matterId: string, contactId: string, data: any) {
    return fetchWithAuth(`/matters/${matterId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteContact(matterId: string, contactId: string) {
    return fetchWithAuth(`/matters/${matterId}/contacts/${contactId}`, { method: 'DELETE' });
  },

  // Permissions
  async getPermissions(matterId: string) {
    return fetchWithAuth(`/matters/${matterId}/permissions`);
  },

  async updateVisibility(matterId: string, visibility: 'firm_wide' | 'restricted') {
    return fetchWithAuth(`/matters/${matterId}/visibility`, {
      method: 'PUT',
      body: JSON.stringify({ visibility }),
    });
  },

  async addPermission(matterId: string, data: {
    userId?: string;
    groupId?: string;
    permissionLevel?: 'view' | 'edit' | 'admin';
    canViewDocuments?: boolean;
    canViewNotes?: boolean;
    canEdit?: boolean;
  }) {
    return fetchWithAuth(`/matters/${matterId}/permissions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async removePermission(matterId: string, permissionId: string) {
    return fetchWithAuth(`/matters/${matterId}/permissions/${permissionId}`, { method: 'DELETE' });
  },

  async bulkUpdatePermissions(data: {
    matterIds: string[];
    action: 'add' | 'remove';
    userId?: string;
    groupId?: string;
    visibility?: 'firm_wide' | 'restricted';
    permissionLevel?: 'view' | 'edit' | 'admin';
  }) {
    return fetchWithAuth('/matters/bulk-permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAvailableUsers(excludeMatterId?: string, search?: string) {
    const query = new URLSearchParams();
    if (excludeMatterId) query.set('excludeMatterId', excludeMatterId);
    if (search) query.set('search', search);
    return fetchWithAuth(`/matters/permissions/users?${query}`);
  },

  async getAvailableGroups(excludeMatterId?: string) {
    const query = new URLSearchParams();
    if (excludeMatterId) query.set('excludeMatterId', excludeMatterId);
    return fetchWithAuth(`/matters/permissions/groups?${query}`);
  },

  // Conflict Check
  async checkConflicts(data: { 
    clientName?: string; 
    partyNames?: string[]; 
    matterName?: string;
  }) {
    return fetchWithAuth('/matters/conflict-check', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async markConflictCleared(matterId: string, data: {
    cleared?: boolean;
    notes?: string;
    checkedBy?: string;
  }) {
    return fetchWithAuth(`/matters/${matterId}/conflict-cleared`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// TIME ENTRIES API
// ============================================

export const timeEntriesApi = {
  async getAll(params?: {
    matterId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    billable?: boolean;
    billed?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.userId) query.set('userId', params.userId);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.billable !== undefined) query.set('billable', String(params.billable));
    if (params?.billed !== undefined) query.set('billed', String(params.billed));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    
    return fetchWithAuth(`/time-entries?${query}`);
  },

  async create(data: any) {
    return fetchWithAuth('/time-entries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchWithAuth(`/time-entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/time-entries/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// INVOICES API
// ============================================

export const invoicesApi = {
  async getAll(params?: { clientId?: string; matterId?: string; status?: string; view?: 'my' | 'all' }) {
    const query = new URLSearchParams();
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.status) query.set('status', params.status);
    if (params?.view) query.set('view', params.view);
    
    return fetchWithAuth(`/invoices?${query}`);
  },

  async getById(id: string) {
    return fetchWithAuth(`/invoices/${id}`);
  },

  async create(data: any) {
    return fetchWithAuth('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchWithAuth(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async recordPayment(id: string, data: any) {
    return fetchWithAuth(`/invoices/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPayments(id: string) {
    return fetchWithAuth(`/invoices/${id}/payments`);
  },

  async getTimeEntries(id: string) {
    return fetchWithAuth(`/invoices/${id}/time-entries`);
  },

  async merge(keepInvoiceId: string, mergeInvoiceIds: string[]) {
    return fetchWithAuth(`/invoices/${keepInvoiceId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ mergeInvoiceIds }),
    });
  },

  async syncToQuickBooks(id: string) {
    return fetchWithAuth(`/invoices/${id}/sync-quickbooks`, {
      method: 'POST',
    });
  },

  async syncPaymentToQuickBooks(invoiceId: string, paymentId: string) {
    return fetchWithAuth(`/invoices/${invoiceId}/payments/${paymentId}/sync-quickbooks`, {
      method: 'POST',
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/invoices/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// CALENDAR API
// ============================================

export const calendarApi = {
  async getEvents(params?: { startDate?: string; endDate?: string; matterId?: string; type?: string }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.type) query.set('type', params.type);
    
    return fetchWithAuth(`/calendar?${query}`);
  },

  async create(data: any) {
    return fetchWithAuth('/calendar', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return fetchWithAuth(`/calendar/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/calendar/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// DOCUMENTS API
// ============================================

export const documentsApi = {
  async getAll(params?: { matterId?: string; clientId?: string; search?: string }) {
    const query = new URLSearchParams();
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.search) query.set('search', params.search);
    
    return fetchWithAuth(`/documents?${query}`);
  },

  async upload(file: File, metadata: { matterId?: string; clientId?: string; tags?: string[] }) {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata.matterId) formData.append('matterId', metadata.matterId);
    if (metadata.clientId) formData.append('clientId', metadata.clientId);
    if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));

    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_URL}/documents`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new ApiError(response.status, error.error || 'Upload failed', error);
    }

    return response.json();
  },

  async update(id: string, data: any) {
    return fetchWithAuth(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/documents/${id}`, { method: 'DELETE' });
  },

  getDownloadUrl(id: string) {
    return `${API_URL}/documents/${id}/download`;
  },

  async download(id: string): Promise<Blob> {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(`${API_URL}/documents/${id}/download`, {
      headers,
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to download document');
    }
    
    return response.blob();
  },

  async getContent(id: string) {
    return fetchWithAuth(`/documents/${id}/content`);
  },

  // Download all documents as a zip file
  async downloadAll() {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(`${API_URL}/documents/download-all/zip`, {
      headers,
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to download documents');
    }
    
    return response.blob();
  },

  // Extract text from a file without saving it (for AI analysis)
  async extractText(file: File): Promise<{ name: string; type: string; size: number; content: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_URL}/documents/extract-text`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Extraction failed' }));
      throw new ApiError(response.status, error.error || 'Extraction failed', error);
    }

    return response.json();
  },
};

// ============================================
// TEAM API
// ============================================

export const teamApi = {
  async getMembers() {
    return fetchWithAuth('/team');
  },

  async getAttorneys() {
    return fetchWithAuth('/team/attorneys');
  },

  async updateMember(id: string, data: any) {
    return fetchWithAuth(`/team/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async removeMember(id: string) {
    return fetchWithAuth(`/team/${id}`, { method: 'DELETE' });
  },

  async getInvitations() {
    return fetchWithAuth('/team/invitations');
  },

  async invite(data: { email: string; firstName?: string; lastName?: string; role?: string }) {
    return fetchWithAuth('/team/invitations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeInvitation(id: string) {
    return fetchWithAuth(`/team/invitations/${id}`, { method: 'DELETE' });
  },

  async getGroups() {
    return fetchWithAuth('/team/groups');
  },

  async createGroup(data: any) {
    return fetchWithAuth('/team/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateGroup(id: string, data: any) {
    return fetchWithAuth(`/team/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteGroup(id: string) {
    return fetchWithAuth(`/team/groups/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// API KEYS API
// ============================================

export const apiKeysApi = {
  async getAll() {
    return fetchWithAuth('/api-keys');
  },

  async create(data: { name: string; permissions: string[]; expiresAt?: string }) {
    return fetchWithAuth('/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revoke(id: string) {
    return fetchWithAuth(`/api-keys/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// FIRM API
// ============================================

export const firmApi = {
  async get() {
    return fetchWithAuth('/firm');
  },

  async update(data: any) {
    return fetchWithAuth('/firm', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getDashboard() {
    return fetchWithAuth('/firm/dashboard');
  },

  async getAuditLogs(params?: { userId?: string; resourceType?: string; startDate?: string; endDate?: string }) {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.resourceType) query.set('resourceType', params.resourceType);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    
    return fetchWithAuth(`/firm/audit-logs?${query}`);
  },

  async getNotifications() {
    return fetchWithAuth('/firm/notifications');
  },

  async markNotificationRead(id: string) {
    return fetchWithAuth(`/firm/notifications/${id}/read`, { method: 'PUT' });
  },

  async markAllNotificationsRead() {
    return fetchWithAuth('/firm/notifications/read-all', { method: 'PUT' });
  },
};

// ============================================
// USER SETTINGS API
// ============================================

export const userSettingsApi = {
  async get() {
    return fetchWithAuth('/user-settings');
  },

  async update(data: any) {
    return fetchWithAuth('/user-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getAISettings() {
    return fetchWithAuth('/user-settings/ai');
  },

  async updateAISettings(data: { aiCustomInstructions: string }) {
    return fetchWithAuth('/user-settings/ai', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// AI API
// ============================================

export const aiApi = {
  // Original chat endpoint (context-based, no actions)
  async chat(message: string, page: string, context?: any, conversationHistory?: { role: string; content: string }[]) {
    return fetchWithAuth('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, page, context, conversationHistory }),
    });
  },

  // AI Agent endpoint (with function calling - can take actions immediately!)
  async agentChat(message: string, conversationHistory?: { role: string; content: string }[], fileContext?: Record<string, any>) {
    return fetchWithAuth('/v1/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationHistory, fileContext }),
    });
  },

  // ============================================
  // BACKGROUND AGENT API (Amplifier-powered)
  // ============================================
  
  // Check if background agent is available
  async getBackgroundAgentStatus() {
    return fetchWithAuth('/v1/background-agent/status');
  },

  // Start a background task
  async startBackgroundTask(goal: string, options?: Record<string, any>) {
    return fetchWithAuth('/v1/background-agent/tasks', {
      method: 'POST',
      body: JSON.stringify({ goal, options }),
    });
  },

  // Get all background tasks
  async getBackgroundTasks(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return fetchWithAuth(`/v1/background-agent/tasks${query}`);
  },

  // Get active background task
  async getActiveBackgroundTask() {
    return fetchWithAuth('/v1/background-agent/tasks/active');
  },

  // Get specific background task
  async getBackgroundTask(taskId: string) {
    return fetchWithAuth(`/v1/background-agent/tasks/${taskId}`);
  },

  // Cancel background task
  async cancelBackgroundTask(taskId: string) {
    return fetchWithAuth(`/v1/background-agent/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  },

  // Send follow-up instructions to a running background task
  async sendBackgroundTaskFollowUp(taskId: string, message: string) {
    return fetchWithAuth(`/v1/background-agent/tasks/${taskId}/followup`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  // Get background task history
  async getBackgroundTaskHistory(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return fetchWithAuth(`/v1/background-agent/history${query}`);
  },

  // Get learned patterns
  async getLearnedPatterns(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return fetchWithAuth(`/v1/background-agent/learnings${query}`);
  },

  // Get available tools
  async getBackgroundAgentTools() {
    return fetchWithAuth('/v1/background-agent/tools');
  },

  // Background task management
  async getActiveTask() {
    return fetchWithAuth('/v1/agent/tasks/active/current');
  },

  async getTask(taskId: string) {
    return fetchWithAuth(`/v1/agent/tasks/${taskId}`);
  },

  async getTasks() {
    return fetchWithAuth('/v1/agent/tasks');
  },

  async cancelTask(taskId: string) {
    return fetchWithAuth(`/v1/agent/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  },

  async getSuggestions(page: string) {
    return fetchWithAuth(`/ai/suggestions?page=${page}`);
  },

  // Voice AI methods - convert blob to base64 for API
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  async transcribeAudio(audioBlob: Blob): Promise<{ success: boolean; text: string; error?: string }> {
    const audio = await this.blobToBase64(audioBlob);
    return fetchWithAuth('/v1/agent/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audio, format: 'webm' }),
    });
  },

  async synthesizeSpeech(text: string, voice?: string): Promise<Blob> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(`${API_URL}/v1/agent/voice/synthesize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voice }),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Synthesis failed' }));
      throw new ApiError(response.status, error.error || 'Synthesis failed', error);
    }
    
    // Backend returns JSON with base64 audio, convert to Blob
    const data = await response.json();
    if (!data.success || !data.audio) {
      throw new ApiError(400, data.error || 'No audio returned', data);
    }
    
    // Convert base64 to Blob
    const binaryString = atob(data.audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'audio/mp3' });
  },

  async voiceChat(audioBlob: Blob, conversationHistory?: { role: string; content: string }[], voice?: string): Promise<{ success: boolean; userText: string; aiText: string; audio?: string; toolsUsed?: boolean }> {
    const audio = await this.blobToBase64(audioBlob);
    return fetchWithAuth('/v1/agent/voice/chat', {
      method: 'POST',
      body: JSON.stringify({ 
        audio, 
        format: 'webm',
        voice: voice || 'en-US-JennyNeural',
        conversationHistory: conversationHistory || []
      }),
    });
  },

  async getVoices(): Promise<{ voices: Array<{ name: string; locale: string; gender: string }> }> {
    return fetchWithAuth('/v1/agent/voice/voices');
  },
};

// ============================================
// MATTER TYPES API
// ============================================

export const matterTypesApi = {
  async getAll() {
    return fetchWithAuth('/matter-types');
  },

  async create(data: { value: string; label: string }) {
    return fetchWithAuth('/matter-types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: { value?: string; label?: string; active?: boolean }) {
    return fetchWithAuth(`/matter-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithAuth(`/matter-types/${id}`, { method: 'DELETE' });
  },

  async seedDefaults() {
    return fetchWithAuth('/matter-types/seed-defaults', { method: 'POST' });
  },
};

// ============================================
// BILLING DATA API
// ============================================

export const billingDataApi = {
  // Get all billing data at once
  async getAll() {
    return fetchWithAuth('/billing-data/all');
  },

  // Billing Settings
  async getSettings() {
    return fetchWithAuth('/billing-data/settings');
  },

  async updateSettings(data: any) {
    return fetchWithAuth('/billing-data/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Invoice Templates
  async getInvoiceTemplates() {
    return fetchWithAuth('/billing-data/invoice-templates');
  },

  async createInvoiceTemplate(data: any) {
    return fetchWithAuth('/billing-data/invoice-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateInvoiceTemplate(id: string, data: any) {
    return fetchWithAuth(`/billing-data/invoice-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteInvoiceTemplate(id: string) {
    return fetchWithAuth(`/billing-data/invoice-templates/${id}`, { method: 'DELETE' });
  },

  // Payment Processors
  async getPaymentProcessors() {
    return fetchWithAuth('/billing-data/payment-processors');
  },

  async createPaymentProcessor(data: any) {
    return fetchWithAuth('/billing-data/payment-processors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updatePaymentProcessor(id: string, data: any) {
    return fetchWithAuth(`/billing-data/payment-processors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deletePaymentProcessor(id: string) {
    return fetchWithAuth(`/billing-data/payment-processors/${id}`, { method: 'DELETE' });
  },

  // Payment Links
  async getPaymentLinks() {
    return fetchWithAuth('/billing-data/payment-links');
  },

  async createPaymentLink(data: { invoiceId: string; clientId?: string; amount: number }) {
    return fetchWithAuth('/billing-data/payment-links', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updatePaymentLink(id: string, data: { status: string }) {
    return fetchWithAuth(`/billing-data/payment-links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Recurring Payments
  async getRecurringPayments() {
    return fetchWithAuth('/billing-data/recurring-payments');
  },

  async createRecurringPayment(data: any) {
    return fetchWithAuth('/billing-data/recurring-payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateRecurringPayment(id: string, data: any) {
    return fetchWithAuth(`/billing-data/recurring-payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteRecurringPayment(id: string) {
    return fetchWithAuth(`/billing-data/recurring-payments/${id}`, { method: 'DELETE' });
  },

  // Trust Accounts
  async getTrustAccounts() {
    return fetchWithAuth('/billing-data/trust-accounts');
  },

  async createTrustAccount(data: any) {
    return fetchWithAuth('/billing-data/trust-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTrustAccount(id: string, data: any) {
    return fetchWithAuth(`/billing-data/trust-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTrustAccount(id: string) {
    return fetchWithAuth(`/billing-data/trust-accounts/${id}`, { method: 'DELETE' });
  },

  // Trust Transactions
  async getTrustTransactions(params?: { trustAccountId?: string; clientId?: string }) {
    const query = new URLSearchParams();
    if (params?.trustAccountId) query.set('trustAccountId', params.trustAccountId);
    if (params?.clientId) query.set('clientId', params.clientId);
    return fetchWithAuth(`/billing-data/trust-transactions?${query}`);
  },

  async createTrustTransaction(data: any) {
    return fetchWithAuth('/billing-data/trust-transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTrustTransaction(id: string, data: { clearedAt?: string }) {
    return fetchWithAuth(`/billing-data/trust-transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// DOCUMENT TEMPLATES API
// ============================================

export const documentTemplatesApi = {
  // Get all template data at once
  async getAll() {
    return fetchWithAuth('/document-templates/all/data');
  },

  // Templates
  async getTemplates(params?: { category?: string; search?: string }) {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    return fetchWithAuth(`/document-templates?${query}`);
  },

  async getTemplate(id: string) {
    return fetchWithAuth(`/document-templates/${id}`);
  },

  async createTemplate(data: any) {
    return fetchWithAuth('/document-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTemplate(id: string, data: any) {
    return fetchWithAuth(`/document-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async duplicateTemplate(id: string) {
    return fetchWithAuth(`/document-templates/${id}/duplicate`, { method: 'POST' });
  },

  async deleteTemplate(id: string) {
    return fetchWithAuth(`/document-templates/${id}`, { method: 'DELETE' });
  },

  async incrementUsage(id: string) {
    return fetchWithAuth(`/document-templates/${id}/use`, { method: 'POST' });
  },

  // Generated Documents
  async getGeneratedDocuments(params?: { templateId?: string; matterId?: string; clientId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.templateId) query.set('templateId', params.templateId);
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.status) query.set('status', params.status);
    return fetchWithAuth(`/document-templates/generated/all?${query}`);
  },

  async createGeneratedDocument(data: any) {
    return fetchWithAuth('/document-templates/generated', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateGeneratedDocument(id: string, data: any) {
    return fetchWithAuth(`/document-templates/generated/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteGeneratedDocument(id: string) {
    return fetchWithAuth(`/document-templates/generated/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// TIMER STATE API
// ============================================

export const timerApi = {
  async get() {
    return fetchWithAuth('/timer');
  },

  async update(data: {
    isRunning?: boolean;
    isPaused?: boolean;
    matterId?: string | null;
    matterName?: string | null;
    clientId?: string | null;
    clientName?: string | null;
    startTime?: string | null;
    pausedAt?: string | null;
    accumulatedSeconds?: number;
  }) {
    return fetchWithAuth('/timer', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async clear() {
    return fetchWithAuth('/timer', { method: 'DELETE' });
  },
};

// ============================================
// INTEGRATIONS API
// ============================================

export const integrationsApi = {
  async getAll() {
    return fetchWithAuth('/integrations');
  },

  // Google Calendar
  async connectGoogle() {
    return fetchWithAuth('/integrations/google/connect');
  },

  async disconnectGoogle() {
    return fetchWithAuth('/integrations/google/disconnect', { method: 'POST' });
  },

  async syncGoogle() {
    return fetchWithAuth('/integrations/google/sync', { method: 'POST' });
  },

  // QuickBooks
  async connectQuickBooks() {
    return fetchWithAuth('/integrations/quickbooks/connect');
  },

  async disconnectQuickBooks() {
    return fetchWithAuth('/integrations/quickbooks/disconnect', { method: 'POST' });
  },

  async syncQuickBooks() {
    return fetchWithAuth('/integrations/quickbooks/sync', { method: 'POST' });
  },

  // Outlook
  async connectOutlook() {
    return fetchWithAuth('/integrations/outlook/connect');
  },

  async disconnectOutlook() {
    return fetchWithAuth('/integrations/outlook/disconnect', { method: 'POST' });
  },

  async getOutlookEmails() {
    return fetchWithAuth('/integrations/outlook/emails');
  },

  async getOutlookDrafts() {
    return fetchWithAuth('/integrations/outlook/drafts');
  },

  async getOutlookSent() {
    return fetchWithAuth('/integrations/outlook/sent');
  },

  async getOutlookEmailBody(emailId: string) {
    return fetchWithAuth(`/integrations/outlook/email/${emailId}/body`);
  },

  async sendOutlookEmail(data: { to: string; cc?: string; subject: string; body: string; documentIds?: string[] }) {
    return fetchWithAuth('/integrations/outlook/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async saveOutlookDraft(data: { to?: string; cc?: string; subject?: string; body?: string }) {
    return fetchWithAuth('/integrations/outlook/drafts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteOutlookEmail(emailId: string) {
    return fetchWithAuth(`/integrations/outlook/email/${emailId}`, { method: 'DELETE' });
  },

  async archiveOutlookEmail(emailId: string) {
    return fetchWithAuth(`/integrations/outlook/email/${emailId}/archive`, { method: 'POST' });
  },

  async syncOutlookCalendar() {
    return fetchWithAuth('/integrations/outlook/sync-calendar', { method: 'POST' });
  },

  // OneDrive
  async connectOneDrive() {
    return fetchWithAuth('/integrations/onedrive/connect');
  },

  async disconnectOneDrive() {
    return fetchWithAuth('/integrations/onedrive/disconnect', { method: 'POST' });
  },

  async syncOneDrive() {
    return fetchWithAuth('/integrations/onedrive/sync', { method: 'POST' });
  },

  // Google Drive
  async connectGoogleDrive() {
    return fetchWithAuth('/integrations/googledrive/connect');
  },

  async disconnectGoogleDrive() {
    return fetchWithAuth('/integrations/googledrive/disconnect', { method: 'POST' });
  },

  async syncGoogleDrive() {
    return fetchWithAuth('/integrations/googledrive/sync', { method: 'POST' });
  },

  // Dropbox
  async connectDropbox() {
    return fetchWithAuth('/integrations/dropbox/connect');
  },

  async disconnectDropbox() {
    return fetchWithAuth('/integrations/dropbox/disconnect', { method: 'POST' });
  },

  async syncDropbox() {
    return fetchWithAuth('/integrations/dropbox/sync', { method: 'POST' });
  },

  // DocuSign
  async connectDocuSign() {
    return fetchWithAuth('/integrations/docusign/connect');
  },

  async disconnectDocuSign() {
    return fetchWithAuth('/integrations/docusign/disconnect', { method: 'POST' });
  },

  async syncDocuSign() {
    return fetchWithAuth('/integrations/docusign/sync', { method: 'POST' });
  },

  // Slack
  async connectSlack() {
    return fetchWithAuth('/integrations/slack/connect');
  },

  async disconnectSlack() {
    return fetchWithAuth('/integrations/slack/disconnect', { method: 'POST' });
  },

  async syncSlack() {
    return fetchWithAuth('/integrations/slack/sync', { method: 'POST' });
  },

  // Zoom
  async connectZoom() {
    return fetchWithAuth('/integrations/zoom/connect');
  },

  async disconnectZoom() {
    return fetchWithAuth('/integrations/zoom/disconnect', { method: 'POST' });
  },

  async syncZoom() {
    return fetchWithAuth('/integrations/zoom/sync', { method: 'POST' });
  },

  // Quicken
  async connectQuicken() {
    return fetchWithAuth('/integrations/quicken/connect');
  },

  async disconnectQuicken() {
    return fetchWithAuth('/integrations/quicken/disconnect', { method: 'POST' });
  },

  async syncQuicken() {
    return fetchWithAuth('/integrations/quicken/sync', { method: 'POST' });
  },

  // Sync Settings
  async updateSyncSettings(provider: string, settings: Record<string, boolean>) {
    return fetchWithAuth(`/integrations/${provider}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  },

  // Link email to matter/client
  async linkEmailToMatter(emailId: string, data: { matterId?: string; clientId?: string }) {
    return fetchWithAuth('/integrations/outlook/link-email', {
      method: 'POST',
      body: JSON.stringify({ emailId, ...data }),
    });
  },

  // Get QuickBooks data
  async getQuickBooksInvoices() {
    return fetchWithAuth('/integrations/quickbooks/invoices');
  },

  async getQuickBooksCustomers() {
    return fetchWithAuth('/integrations/quickbooks/customers');
  },

  // Get cloud storage files
  async getOneDriveFiles() {
    return fetchWithAuth('/integrations/onedrive/files');
  },

  async getGoogleDriveFiles() {
    return fetchWithAuth('/integrations/googledrive/files');
  },

  async getDropboxFiles() {
    return fetchWithAuth('/integrations/dropbox/files');
  },

  // Get DocuSign envelopes
  async getDocuSignEnvelopes() {
    return fetchWithAuth('/integrations/docusign/envelopes');
  },

  // Get Slack channels
  async getSlackChannels() {
    return fetchWithAuth('/integrations/slack/channels');
  },

  async sendSlackMessage(channel: string, message: string) {
    return fetchWithAuth('/integrations/slack/send', {
      method: 'POST',
      body: JSON.stringify({ channel, message }),
    });
  },

  // Get Zoom meetings
  async getZoomMeetings() {
    return fetchWithAuth('/integrations/zoom/meetings');
  },

  // Get client communications
  async getClientCommunications(clientId: string) {
    return fetchWithAuth(`/integrations/client/${clientId}/communications`);
  },
};

// ============================================
// DRIVE API - Document Drive Integration
// ============================================

export const driveApi = {
  // Drive Configurations
  async getConfigurations() {
    return fetchWithAuth('/drive/configurations');
  },

  async getConfiguration(id: string) {
    return fetchWithAuth(`/drive/configurations/${id}`);
  },

  async createConfiguration(data: {
    name: string;
    driveType?: string;
    rootPath: string;
    syncEnabled?: boolean;
    syncIntervalMinutes?: number;
    syncDirection?: string;
    autoVersionOnSave?: boolean;
    conflictResolution?: string;
    isDefault?: boolean;
    isPersonal?: boolean;
    settings?: Record<string, unknown>;
  }) {
    return fetchWithAuth('/drive/configurations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateConfiguration(id: string, data: Partial<{
    name: string;
    rootPath: string;
    syncEnabled: boolean;
    syncIntervalMinutes: number;
    syncDirection: string;
    autoVersionOnSave: boolean;
    conflictResolution: string;
    isDefault: boolean;
    settings: Record<string, unknown>;
  }>) {
    return fetchWithAuth(`/drive/configurations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteConfiguration(id: string) {
    return fetchWithAuth(`/drive/configurations/${id}`, { method: 'DELETE' });
  },

  // Document Versions
  async getVersions(documentId: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/versions`);
  },

  async getVersionContent(documentId: string, versionId: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/versions/${versionId}/content`);
  },

  async createVersion(documentId: string, data: {
    content: string;
    versionLabel?: string;
    changeSummary?: string;
    changeType?: string;
  }) {
    return fetchWithAuth(`/drive/documents/${documentId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async restoreVersion(documentId: string, versionId: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
  },

  // Initiate retrieval of archived version
  async rehydrateVersion(documentId: string, versionNumber: number) {
    return fetchWithAuth(`/drive/documents/${documentId}/versions/${versionNumber}/rehydrate`, {
      method: 'POST',
    });
  },

  // Document Comparison
  async compareVersions(documentId: string, version1: number, version2: number) {
    return fetchWithAuth(`/drive/documents/${documentId}/compare?version1=${version1}&version2=${version2}`);
  },

  // Document Locking
  async acquireLock(documentId: string, lockType?: string, sessionId?: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ lockType, sessionId }),
    });
  },

  async sendHeartbeat(documentId: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/lock/heartbeat`, {
      method: 'POST',
    });
  },

  async releaseLock(documentId: string, reason?: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/lock`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  },

  async getLockStatus(documentId: string) {
    return fetchWithAuth(`/drive/documents/${documentId}/lock`);
  },

  // Document Activities
  async getActivities(documentId: string, limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    return fetchWithAuth(`/drive/documents/${documentId}/activities?${params}`);
  },

  // Folders
  async getFolders(driveId?: string, path?: string) {
    const params = new URLSearchParams();
    if (driveId) params.set('driveId', driveId);
    if (path) params.set('path', path);
    return fetchWithAuth(`/drive/folders?${params}`);
  },

  async createFolder(name: string, parentPath?: string, driveId?: string) {
    return fetchWithAuth('/drive/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentPath, driveId }),
    });
  },

  // Admin: Browse firm's drive contents
  async browseDrive(folderPath?: string) {
    const params = folderPath ? `?path=${encodeURIComponent(folderPath)}` : '';
    return fetchWithAuth(`/drive/browse${params}`);
  },

  // Admin: Get connection info for mapping drive
  async getConnectionInfo() {
    return fetchWithAuth('/drive/connection-info');
  },

  // Admin: Download desktop shortcut for Windows
  async downloadWindowsShortcut() {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const response = await fetch(`${API_URL}/drive/download-shortcut/windows`, {
      headers,
      credentials: 'include',
    });
    if (!response.ok) throw new ApiError(response.status, 'Failed to download shortcut');
    return response.blob();
  },

  // Admin: Download desktop shortcut for Mac
  async downloadMacShortcut() {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const response = await fetch(`${API_URL}/drive/download-shortcut/mac`, {
      headers,
      credentials: 'include',
    });
    if (!response.ok) throw new ApiError(response.status, 'Failed to download shortcut');
    return response.blob();
  },
};

// ============================================
// DRIVE SYNC API - Auto-sync documents from drives
// ============================================

export const driveSyncApi = {
  // Trigger sync for a drive
  async syncDrive(driveId: string) {
    return fetchWithAuth(`/drive-sync/sync/${driveId}`, { method: 'POST' });
  },

  // Get sync status
  async getStatus() {
    return fetchWithAuth('/drive-sync/status');
  },

  // Watch a folder for changes
  async watchFolder(driveId: string, folderPath?: string) {
    return fetchWithAuth(`/drive-sync/watch/${driveId}`, {
      method: 'POST',
      body: JSON.stringify({ folderPath }),
    });
  },
};

// ============================================
// DOCUMENT PERMISSIONS API
// ============================================

export const documentPermissionsApi = {
  // Folder permissions
  async getFolderPermissions(folderPath?: string, driveId?: string) {
    const params = new URLSearchParams();
    if (folderPath) params.set('folderPath', folderPath);
    if (driveId) params.set('driveId', driveId);
    return fetchWithAuth(`/document-permissions/folders?${params}`);
  },

  async setFolderPermission(data: {
    folderPath: string;
    driveId?: string;
    userId?: string;
    groupId?: string;
    permissionLevel?: string;
    canView?: boolean;
    canDownload?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canCreate?: boolean;
    canShare?: boolean;
    canManagePermissions?: boolean;
  }) {
    return fetchWithAuth('/document-permissions/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteFolderPermission(permissionId: string) {
    return fetchWithAuth(`/document-permissions/folders/${permissionId}`, { method: 'DELETE' });
  },

  // Document permissions
  async getDocumentPermissions(documentId: string) {
    return fetchWithAuth(`/document-permissions/documents/${documentId}`);
  },

  async setDocumentPermission(documentId: string, data: {
    userId?: string;
    groupId?: string;
    permissionLevel?: string;
    canView?: boolean;
    canDownload?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canShare?: boolean;
    expiresAt?: string;
  }) {
    return fetchWithAuth(`/document-permissions/documents/${documentId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateDocumentPrivacy(documentId: string, data: {
    isPrivate?: boolean;
    privacyLevel?: 'private' | 'shared' | 'team' | 'firm';
  }) {
    return fetchWithAuth(`/document-permissions/documents/${documentId}/privacy`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteDocumentPermission(documentId: string, permissionId: string) {
    return fetchWithAuth(`/document-permissions/documents/${documentId}/permissions/${permissionId}`, { 
      method: 'DELETE' 
    });
  },

  // User preferences
  async getPreferences() {
    return fetchWithAuth('/document-permissions/preferences');
  },

  async updatePreferences(data: {
    defaultPrivacy?: string;
    privateFolderPatterns?: string[];
    notifyOnAccess?: boolean;
    notifyOnEdit?: boolean;
    preferWordOnline?: boolean;
    autoSaveInterval?: number;
  }) {
    return fetchWithAuth('/document-permissions/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// WORD ONLINE API - Real-time Co-Editing
// ============================================

export const wordOnlineApi = {
  // Open document in Word Online
  async openDocument(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/open`, { method: 'POST' });
  },

  // Get active editors
  async getActiveEditors(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/editors`);
  },

  // Send heartbeat while editing
  async sendHeartbeat(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/heartbeat`, { method: 'POST' });
  },

  // Close editing session
  async closeSession(documentId: string, changesCount?: number) {
    return fetchWithAuth(`/word-online/documents/${documentId}/close`, {
      method: 'POST',
      body: JSON.stringify({ changesCount }),
    });
  },

  // Share document
  async shareDocument(documentId: string, data: {
    userIds?: string[];
    groupIds?: string[];
    permissionLevel?: string;
    canEdit?: boolean;
    canDownload?: boolean;
    canShare?: boolean;
    message?: string;
    expiresAt?: string;
  }) {
    return fetchWithAuth(`/word-online/documents/${documentId}/share`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get shares
  async getShares(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/shared`);
  },

  // Remove share
  async removeShare(documentId: string, shareId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/share/${shareId}`, { method: 'DELETE' });
  },

  // Get version history with editor info
  async getVersionHistory(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/versions-online`);
  },

  // Get redline comparison between two versions
  async getRedline(documentId: string, version1: number, version2: number) {
    return fetchWithAuth(`/word-online/documents/${documentId}/redline?version1=${version1}&version2=${version2}`);
  },

  // Get specific version info
  async getVersionInfo(documentId: string, versionNumber: number) {
    return fetchWithAuth(`/word-online/documents/${documentId}/versions/${versionNumber}`);
  },

  // Download specific version
  async downloadVersion(documentId: string, versionNumber: number): Promise<{ blob: Blob; filename: string }> {
    const headers: HeadersInit = {};
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_URL}/word-online/documents/${documentId}/versions/${versionNumber}/download`, {
      headers,
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Download failed' }));
      throw new ApiError(response.status, error.error || 'Failed to download version');
    }
    
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    let filename = `document-version-${versionNumber}`;
    const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
    if (filenameMatch) {
      filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ''));
    }
    
    const blob = await response.blob();
    return { blob, filename };
  },

  // Get download URL for a version (useful for links)
  getVersionDownloadUrl(documentId: string, versionNumber: number) {
    return `${API_URL}/word-online/documents/${documentId}/versions/${versionNumber}/download`;
  },

  // Open document in desktop Word
  async openDesktop(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/open-desktop`, { method: 'POST' });
  },

  // Save/sync document from Word Online
  async saveFromWord(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/save`, { method: 'POST' });
  },

  // Check for changes in OneDrive
  async checkChanges(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/check-changes`);
  },

  // Poll and auto-sync changes
  async pollSync(documentId: string) {
    return fetchWithAuth(`/word-online/documents/${documentId}/poll-sync`, { method: 'POST' });
  },

  // Refresh Microsoft token (for long editing sessions)
  async refreshToken() {
    return fetchWithAuth(`/word-online/token/refresh`, { method: 'POST' });
  },

  // Get token status
  async getTokenStatus() {
    return fetchWithAuth(`/word-online/token/status`);
  },
};

// ============================================
// ADMIN API (Platform Admin Only)
// ============================================

export const adminApi = {
  // Stats
  async getStats() {
    return fetchWithAuth('/admin/stats');
  },

  // Firms
  async getFirms() {
    return fetchWithAuth('/admin/firms');
  },

  async createFirm(data: { name: string; email?: string; phone?: string; address?: string; city?: string; state?: string; zipCode?: string; website?: string }) {
    return fetchWithAuth('/admin/firms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateFirm(id: string, data: any) {
    return fetchWithAuth(`/admin/firms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteFirm(id: string) {
    return fetchWithAuth(`/admin/firms/${id}`, { method: 'DELETE' });
  },

  // Users
  async getUsers(firmId?: string) {
    const query = firmId ? `?firmId=${firmId}` : '';
    return fetchWithAuth(`/admin/users${query}`);
  },

  async createUser(data: { firmId: string; email: string; password: string; firstName: string; lastName: string; role?: string; phone?: string; hourlyRate?: number }) {
    return fetchWithAuth('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateUser(id: string, data: any) {
    return fetchWithAuth(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteUser(id: string) {
    return fetchWithAuth(`/admin/users/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// ANALYTICS API
// ============================================

export const analyticsApi = {
  // Get comprehensive firm dashboard data
  async getFirmDashboard(timePeriod: string = 'current_month') {
    return fetchWithAuth(`/analytics/firm-dashboard?time_period=${timePeriod}`);
  },

  // Get firm summary
  async getFirmSummary(timePeriod: string = 'current_month') {
    return fetchWithAuth(`/analytics/firm-summary?time_period=${timePeriod}`);
  },

  // Get quick KPIs
  async getKpis() {
    return fetchWithAuth('/analytics/kpis');
  },

  // Get attorney production value (last 12 months)
  // Uses billable time entries: hours * rate = production value
  async getAttorneyProduction() {
    return fetchWithAuth('/analytics/attorney-production');
  },
};

// Stripe Connect API for Apex Pay
export const stripeApi = {
  // Get connection status
  async getConnectionStatus() {
    return fetchWithAuth('/stripe/connect/status');
  },

  // Get OAuth URL for connecting
  async getOAuthUrl() {
    return fetchWithAuth('/stripe/connect/oauth-url');
  },

  // Handle OAuth callback
  async handleCallback(code: string, state: string) {
    return fetchWithAuth('/stripe/connect/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  },

  // Accept compliance terms
  async acceptCompliance() {
    return fetchWithAuth('/stripe/connect/accept-compliance', {
      method: 'POST',
    });
  },

  // Update settings
  async updateSettings(settings: {
    defaultToTrust?: boolean;
    trustAccountLabel?: string;
    operatingAccountLabel?: string;
    acceptCards?: boolean;
    acceptAch?: boolean;
    acceptApplePay?: boolean;
    acceptGooglePay?: boolean;
  }) {
    return fetchWithAuth('/stripe/connect/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Disconnect Stripe
  async disconnect() {
    return fetchWithAuth('/stripe/connect/disconnect', {
      method: 'POST',
    });
  },

  // Get transactions
  async getTransactions(params?: { status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    return fetchWithAuth(`/stripe/connect/transactions?${query.toString()}`);
  },

  // Get stats
  async getStats() {
    return fetchWithAuth('/stripe/connect/stats');
  },
};

// Notifications API
export const notificationsApi = {
  // Get user preferences
  async getPreferences() {
    return fetchWithAuth('/notifications/preferences');
  },

  // Update preferences
  async updatePreferences(preferences: Record<string, unknown>) {
    return fetchWithAuth('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  },

  // Get notifications
  async getNotifications(params?: { limit?: number; unread_only?: boolean }) {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.unread_only) query.append('unread_only', 'true');
    return fetchWithAuth(`/notifications?${query.toString()}`);
  },

  // Create notification
  async create(notification: {
    user_id?: string;
    title: string;
    message?: string;
    type?: string;
    priority?: string;
    channels?: string[];
    entity_type?: string;
    entity_id?: string;
    action_url?: string;
  }) {
    return fetchWithAuth('/notifications', {
      method: 'POST',
      body: JSON.stringify(notification),
    });
  },

  // Mark as read
  async markAsRead(notificationId: string) {
    return fetchWithAuth(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  },

  // Mark all as read
  async markAllAsRead() {
    return fetchWithAuth('/notifications/read-all', {
      method: 'PUT',
    });
  },

  // Delete notification
  async delete(notificationId: string) {
    return fetchWithAuth(`/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },

  // Test SMS
  async testSms(phone: string) {
    return fetchWithAuth('/notifications/test-sms', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  // Get templates
  async getTemplates() {
    return fetchWithAuth('/notifications/templates');
  },
};

// Export all APIs
export default {
  auth: authApi,
  clients: clientsApi,
  matters: mattersApi,
  matterTypes: matterTypesApi,
  timeEntries: timeEntriesApi,
  invoices: invoicesApi,
  calendar: calendarApi,
  documents: documentsApi,
  team: teamApi,
  firm: firmApi,
  ai: aiApi,
  userSettings: userSettingsApi,
  integrations: integrationsApi,
  admin: adminApi,
  billingData: billingDataApi,
  documentTemplates: documentTemplatesApi,
  timer: timerApi,
  drive: driveApi,
  driveSync: driveSyncApi,
  documentPermissions: documentPermissionsApi,
  wordOnline: wordOnlineApi,
  analytics: analyticsApi,
  stripe: stripeApi,
  notifications: notificationsApi,
};
