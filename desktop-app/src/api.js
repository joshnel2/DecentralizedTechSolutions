const axios = require('axios');
const keytar = require('keytar');

const SERVICE_NAME = 'ApexDrive';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.accessToken = null;
    this.user = null;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
    
    // Add auth header to all requests
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }
  
  async login(email, password) {
    try {
      const response = await this.client.post('/auth/login', { email, password });
      
      if (response.data.accessToken) {
        this.accessToken = response.data.accessToken;
        this.user = response.data.user;
        
        // Store credentials securely
        await keytar.setPassword(SERVICE_NAME, email, this.accessToken);
        await keytar.setPassword(SERVICE_NAME, 'current_user', email);
        
        return { success: true, user: this.user };
      }
      
      return { success: false, error: 'Invalid response from server' };
    } catch (error) {
      const message = error.response?.data?.error || error.message;
      return { success: false, error: message };
    }
  }
  
  async logout() {
    const email = await keytar.getPassword(SERVICE_NAME, 'current_user');
    if (email) {
      await keytar.deletePassword(SERVICE_NAME, email);
      await keytar.deletePassword(SERVICE_NAME, 'current_user');
    }
    this.accessToken = null;
    this.user = null;
  }
  
  async restoreSession() {
    try {
      const email = await keytar.getPassword(SERVICE_NAME, 'current_user');
      if (email) {
        const token = await keytar.getPassword(SERVICE_NAME, email);
        if (token) {
          this.accessToken = token;
          
          // Verify token is still valid
          const response = await this.client.get('/auth/me');
          if (response.data.user) {
            this.user = response.data.user;
            return { success: true, user: this.user };
          }
        }
      }
    } catch (error) {
      // Token expired or invalid
      await this.logout();
    }
    return { success: false };
  }
  
  async getMatters() {
    try {
      const response = await this.client.get('/matters');
      return response.data.matters || [];
    } catch (error) {
      console.error('Failed to get matters:', error.message);
      return [];
    }
  }
  
  async getMatterDocuments(matterId) {
    try {
      const response = await this.client.get(`/documents?matterId=${matterId}`);
      return response.data.documents || [];
    } catch (error) {
      console.error('Failed to get documents:', error.message);
      return [];
    }
  }
  
  async getAllUserDocuments() {
    try {
      // This returns only documents the user has access to
      const response = await this.client.get('/documents');
      return response.data.documents || [];
    } catch (error) {
      console.error('Failed to get documents:', error.message);
      return [];
    }
  }
  
  async downloadDocument(documentId) {
    try {
      const response = await this.client.get(`/documents/${documentId}/download`, {
        responseType: 'arraybuffer',
      });
      return {
        data: Buffer.from(response.data),
        filename: this.getFilenameFromResponse(response) || `document_${documentId}`,
      };
    } catch (error) {
      console.error('Failed to download document:', error.message);
      throw error;
    }
  }
  
  async uploadDocument(filePath, matterId, filename) {
    try {
      const fs = require('fs');
      const FormData = require('form-data');
      
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), filename);
      if (matterId) {
        form.append('matterId', matterId);
      }
      
      const response = await this.client.post('/documents', form, {
        headers: form.getHeaders(),
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to upload document:', error.message);
      throw error;
    }
  }
  
  async getDocumentMetadata(documentId) {
    try {
      const response = await this.client.get(`/documents/${documentId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get document metadata:', error.message);
      return null;
    }
  }
  
  getFilenameFromResponse(response) {
    const disposition = response.headers['content-disposition'];
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match) {
        return decodeURIComponent(match[1].replace(/['"]/g, ''));
      }
    }
    return null;
  }
}

module.exports = { ApiClient };
