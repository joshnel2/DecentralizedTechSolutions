// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Token management
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
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
      accessToken = data.accessToken;
      return true;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  
  // Clear token on refresh failure
  accessToken = null;
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
    accessToken = result.accessToken;
    return result;
  },

  async login(email: string, password: string) {
    const result = await fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result.accessToken) {
      accessToken = result.accessToken;
    }
    return result;
  },

  async logout() {
    try {
      await fetchWithAuth('/auth/logout', { method: 'POST' });
    } finally {
      accessToken = null;
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
  async getAll(params?: { search?: string; type?: string; isActive?: boolean }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.type) query.set('type', params.type);
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    
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
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.priority) query.set('priority', params.priority);
    
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
  }) {
    const query = new URLSearchParams();
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.userId) query.set('userId', params.userId);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.billable !== undefined) query.set('billable', String(params.billable));
    if (params?.billed !== undefined) query.set('billed', String(params.billed));
    
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
  async getAll(params?: { clientId?: string; matterId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.matterId) query.set('matterId', params.matterId);
    if (params?.status) query.set('status', params.status);
    
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
// AI API
// ============================================

export const aiApi = {
  async chat(message: string, page: string, context?: any, conversationHistory?: { role: string; content: string }[]) {
    return fetchWithAuth('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, page, context, conversationHistory }),
    });
  },

  async getSuggestions(page: string) {
    return fetchWithAuth(`/ai/suggestions?page=${page}`);
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
  timeEntries: timeEntriesApi,
  invoices: invoicesApi,
  calendar: calendarApi,
  documents: documentsApi,
  team: teamApi,
  firm: firmApi,
  ai: aiApi,
  integrations: integrationsApi,
  admin: adminApi,
};
