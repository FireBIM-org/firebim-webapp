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

    // On 401 "Not authenticated" from the proxy the user has no active session.
    // Trigger a full re-login so the user is not silently stuck.
    // Note: "Session expired" (RefreshAccessTokenError) is handled centrally by
    // AuthContext — triggering signIn from both places would cause a race.
    // Guard: only run in the browser (no-op during SSR).
    if (typeof window !== 'undefined') {
      this.axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
          const detail = error.response?.data?.detail as string | undefined;
          const isNoSession =
            error.response?.status === 401 &&
            detail === 'Not authenticated';

          if (isNoSession && !isSigningIn) {
            isSigningIn = true;
            try {
              const { signIn } = await import('next-auth/react');
              await signIn('authentik');
            } finally {
              // Always reset so future 401s can trigger re-login if signIn
              // resolves or throws without actually navigating away.
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