import axios, { AxiosInstance } from 'axios';
import { components } from '../types/api';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST || 
                'http://localhost:8000/';

// Define User and Token types based on the API schema
export type User = components['schemas']['User'];
export type UserCreate = components['schemas']['UserCreate'];
export type Token = components['schemas']['Token'];

// Define IFC Model and IDS File interfaces
export interface IFCModel {
  id: string;
  filename: string;
  created_at: string;
  size?: number;
  schema_version?: string;
  entity_count?: number;
  user_id: string;
}

export interface IDSFile {
  id: string;
  filename: string;
  created_at: string;
  size?: number;
  specification_version?: string;
  rule_count?: number;
  user_id: string;
  specifications?: IDSSpecification[];
}

export interface IDSSpecification {
  entity_type?: string;
  property?: string;
  requirement?: string;
}

export interface CheckResult {
  total_entities: number;
  compliant_entities: number;
  non_compliant_entities: number;
  compliance_rate?: number;
  issues?: CheckIssue[];
}

export interface CheckIssue {
  entity_id: string;
  entity_type: string;
  description: string;
}

export interface AsyncCheckResponse {
  check_id: string;
  status: string;
}

export interface AsyncCheckResult {
  status: string;
  result?: CheckResult;
  error?: string;
}

// API client class
export class ApiClient {
  private axiosInstance: AxiosInstance;
  private authAxiosInstance: AxiosInstance;

  constructor() {
    // Instance for direct backend calls (registration)
    this.axiosInstance = axios.create({
      baseURL: API_HOST,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Instance for authenticated calls through Next.js API proxy
    this.authAxiosInstance = axios.create({
      baseURL: '/api/proxy',
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Enable sending cookies
    });
  }

  // Authentication endpoints
  async register(userData: UserCreate): Promise<User> {
    const response = await this.axiosInstance.post('/register', userData);
    return response.data;
  }

  async login(username: string, password: string): Promise<void> {
    // Use internal API route that sets HttpOnly cookie
    const response = await axios.post('/api/auth/login', {
      username,
      password,
    });
    
    if (!response.data.success) {
      throw new Error(response.data.message || 'Login failed - unexpected response from server');
    }
  }

  async logout(): Promise<void> {
    // Use internal API route that clears HttpOnly cookie
    await axios.post('/api/auth/logout');
  }

  async getCurrentUser(): Promise<User> {
    // Use internal API route that reads cookie and proxies to backend
    const response = await axios.get('/api/auth/me');
    return response.data;
  }

  // IFC Models endpoints
  async getModels(): Promise<IFCModel[]> {
    const response = await this.authAxiosInstance.get('/ifc-models');
    return response.data;
  }

  async uploadModel(file: File): Promise<IFCModel> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.authAxiosInstance.post('/ifc-models', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getModel(id: string): Promise<IFCModel> {
    const response = await this.authAxiosInstance.get(`/ifc-models/${id}`);
    return response.data;
  }

  async downloadModel(id: string): Promise<Blob> {
    const response = await this.authAxiosInstance.get(`/ifc-models/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // IDS Files endpoints
  async getIdsFiles(): Promise<IDSFile[]> {
    const response = await this.authAxiosInstance.get('/ids-files');
    return response.data;
  }

  async uploadIds(file: File): Promise<IDSFile> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.authAxiosInstance.post('/ids-files', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getIdsFile(id: string): Promise<IDSFile> {
    const response = await this.authAxiosInstance.get(`/ids-files/${id}`);
    return response.data;
  }

  async downloadIdsFile(id: string): Promise<Blob> {
    const response = await this.authAxiosInstance.get(`/ids-files/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Analysis endpoints
  async asyncCheckModelWithIds(modelId: string, idsId: string): Promise<AsyncCheckResponse> {
    const response = await this.authAxiosInstance.post('/async/check-model-with-ids', null, {
      params: { model_id: modelId, ids_id: idsId },
    });
    return response.data;
  }

  async getAsyncCheckResult(checkId: string): Promise<AsyncCheckResult> {
    const response = await this.authAxiosInstance.get(`/async/check-result/${checkId}`);
    return response.data;
  }

  async syncCheckModelWithIds(modelId: string, idsId: string, timeout = 300): Promise<CheckResult> {
    const response = await this.authAxiosInstance.get(`/ifc-models/${modelId}/check`, {
      params: { ids_id: idsId, timeout },
    });
    return response.data;
  }
}

// Create and export singleton instance
const apiClient = new ApiClient();
export default apiClient;