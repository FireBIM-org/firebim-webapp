import axios, { AxiosInstance } from 'axios';
import { components } from '../types/api';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? '';

// Define User type based on the API schema
export type User = components['schemas']['User'];

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

// Module-level guard: prevents concurrent / repeated signIn() calls when
// multiple in-flight requests all receive a 401 at the same time.
let isSigningIn = false;

// API client class — auth is handled by next-auth via the proxy routes
export class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_HOST,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // On 401 from the proxy the server-side refresh has already failed.
    // Trigger a full re-login immediately so the user is not silently stuck.
    // Guard: only run in the browser (no-op during SSR).
    if (typeof window !== 'undefined') {
      this.axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
          // Any 401 from a proxy route means the session is dead (either the
          // proxy itself couldn't authenticate, or the backend rejected the
          // forwarded access token because it was expired/invalid).
          // Re-login is always the correct action for /api/proxy/* 401s.
          const isProxy401 =
            error.response?.status === 401 &&
            (error.config?.url as string | undefined)?.startsWith('/api/proxy/');

          if (isProxy401 && !isSigningIn) {
            isSigningIn = true;
            try {
              const { signIn } = await import('next-auth/react');
              await signIn('authentik');
            } catch {
              // Reset flag if signIn throws without redirecting so subsequent
              // requests can retry rather than silently swallowing 401s.
              isSigningIn = false;
            }
          }
          return Promise.reject(error);
        }
      );
    }
  }

  // Get user profile from API server (goes through proxy which adds auth)
  async getCurrentUser(): Promise<User> {
    const response = await this.axiosInstance.get('/api/proxy/users/me');
    return response.data;
  }

  // IFC Models endpoints
  async getModels(): Promise<IFCModel[]> {
    const response = await this.axiosInstance.get('/api/proxy/ifc-models');
    return response.data;
  }

  async uploadModel(file: File): Promise<IFCModel> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.axiosInstance.post('/api/proxy/ifc-models', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getModel(id: string): Promise<IFCModel> {
    const response = await this.axiosInstance.get(`/api/proxy/ifc-models/${id}`);
    return response.data;
  }

  async downloadModel(id: string): Promise<Blob> {
    const response = await this.axiosInstance.get(`/api/proxy/ifc-models/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // IDS Files endpoints
  async getIdsFiles(): Promise<IDSFile[]> {
    const response = await this.axiosInstance.get('/api/proxy/ids-files');
    return response.data;
  }

  async uploadIds(file: File): Promise<IDSFile> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.axiosInstance.post('/api/proxy/ids-files', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getIdsFile(id: string): Promise<IDSFile> {
    const response = await this.axiosInstance.get(`/api/proxy/ids-files/${id}`);
    return response.data;
  }

  async downloadIdsFile(id: string): Promise<Blob> {
    const response = await this.axiosInstance.get(`/api/proxy/ids-files/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Analysis endpoints
  async asyncCheckModelWithIds(modelId: string, idsId: string): Promise<AsyncCheckResponse> {
    const response = await this.axiosInstance.post('/api/proxy/async/check-model-with-ids', null, {
      params: { model_id: modelId, ids_id: idsId },
    });
    return response.data;
  }

  async getAsyncCheckResult(checkId: string): Promise<AsyncCheckResult> {
    const response = await this.axiosInstance.get(`/api/proxy/async/check-result/${checkId}`);
    return response.data;
  }

  async syncCheckModelWithIds(modelId: string, idsId: string, timeout = 300): Promise<CheckResult> {
    const response = await this.axiosInstance.get(`/api/proxy/ifc-models/${modelId}/check`, {
      params: { ids_id: idsId, timeout },
    });
    return response.data;
  }
}

// Create and export singleton instance
const apiClient = new ApiClient();
export default apiClient;