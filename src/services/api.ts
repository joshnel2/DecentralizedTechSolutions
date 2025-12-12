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

  async verify2FA(payload: { userId: string; tempToken: string; code: string }) {
    const result = await fetchWithAuth('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (result.accessToken) {
      setAccessToken(result.accessToken);
    }
    return result;
  },

  async start2FASetup() {
    return fetchWithAuth('/auth/2fa/setup', { method: 'POST' });
  },

  async enable2FA(code: string) {
    return fetchWithAuth('/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async disable2FA(code: string) {
    return fetchWithAuth('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
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

  // New AI Agent endpoint (with function calling - can take actions!)
  async agentChat(message: string, conversationHistory?: { role: string; content: string }[]) {
    return fetchWithAuth('/v1/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationHistory }),
    });
  },

  async getSuggestions(page: string) {
    return fetchWithAuth(`/ai/suggestions?page=${page}`);
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

  async syncOutlookCalendar() {
    return fetchWithAuth('/integrations/outlook/sync-calendar', { method: 'POST' });
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
};
