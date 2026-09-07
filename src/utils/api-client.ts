import axios, { AxiosInstance } from 'axios';

import { components } from '../types/api';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? '';

// Define User type based on the API schema
export type User = components['schemas']['User'];

// Ontology registry sync (public firebim.org registry -> this API's ontology store)
export type OntologySyncRequest = components['schemas']['OntologySyncRequest'];
export type OntologySyncResponse = components['schemas']['OntologySyncResponse'];
export type OntologySyncJobResponse = components['schemas']['OntologySyncJobResponse'];
export type OntologySyncItem = components['schemas']['OntologySyncItem'];
export type OntologySyncSource = components['schemas']['OntologySyncSourceResponse'];
export type OntologySummary = components['schemas']['OntologySummaryResponse'];
export type OntologyListResponse = components['schemas']['OntologyListResponse'];
export type OntologyPublishRequest = components['schemas']['OntologyPublishRequest'];
export type OntologyPublishResponse = components['schemas']['OntologyPublishResponse'];
export type OntologyDictionaryConversionRequest =
  components['schemas']['OntologyDictionaryConversionRequest'];
export type OntologyDictionaryConversionResponse =
  components['schemas']['OntologyDictionaryConversionResponse'];
export type LexiconCatalogTerm = components['schemas']['LexiconCatalogTermSummary'];
export type LexiconCatalogTermsResponse = components['schemas']['LexiconCatalogTermsResponse'];
export type RuleTermValidationField = 'target_class' | 'property_path';
export type RuleTermValidationIssue = {
  rule_id: string;
  node_id: string;
  field: RuleTermValidationField;
  expected_kind: 'class' | 'property';
  value: string;
  code: 'unknown_term' | 'wrong_term_kind';
  message: string;
};
export type RuleTermValidationResponse = {
  valid: boolean;
  rule_ids: string[];
  issues: RuleTermValidationIssue[];
  stats: {
    rule_count: number;
    ontology_count: number;
    validated_node_count: number;
    validated_field_count: number;
    invalid_node_count: number;
    issue_count: number;
  };
};
export type RuleTermValidationRequest = {
  selected_ontologies: Array<{
    ontology_family: string;
    country: string;
    version: string;
  }>;
  rule: {
    id: string;
    entry: string;
    elements: Array<{
      id: string;
      element_type: string;
      target_class?: string | null;
      property_path?: string | null;
      operator?: string | null;
      value?: unknown;
      true_path?: string | null;
      false_path?: string | null;
      unknown_path?: string | null;
      label?: string | null;
      config?: Record<string, unknown>;
    }>;
  };
};

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

export interface IFCModelData {
  entities: {
    id: string;
    type: string;
    globalId: string;
    name?: string;
    attributes: Record<string, any>;
    parentId?: string;
  }[];
  properties: {
    entity_id: string;
    property_set_name: string;
    property_name: string;
    value: string;
    value_type: string;
  }[];
  quantities: {
    entity_id: string;
    quantity_set_name: string;
    quantity_name: string;
    value: string;
    value_type: string;
  }[];
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

    // On 401 from any proxy route the session is dead — trigger re-login immediately.
    // This covers both SESSION_EXPIRED (definitively failed refresh) and NOT_AUTHENTICATED
    // (no session cookie), as well as backend-originated 401s forwarded by the proxy.
    // Guard: only run in the browser (no-op during SSR).
    if (typeof window !== 'undefined') {
      this.axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
          const isProxy401 =
            error.response?.status === 401 &&
            (error.config?.url as string | undefined)?.startsWith('/api/proxy/');

          if (isProxy401 && !isSigningIn) {
            isSigningIn = true;
            try {
              const { signIn } = await import('next-auth/react');
              await signIn('authentik');
            } catch {
              // Only reset on error. If signIn succeeds and triggers a redirect,
              // keep the flag true until navigation completes so concurrent
              // in-flight 401s don't fire additional signIn calls.
              isSigningIn = false;
            }
          }
          return Promise.reject(error);
        },
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

  async deleteModel(id: string): Promise<void> {
    await this.axiosInstance.delete(`/api/proxy/ifc-models/${id}`);
  }

  async uploadModelData(id: string, data: IFCModelData): Promise<{ message: string }> {
    const response = await this.axiosInstance.post(
      `/api/proxy/ifc-models/${id}/data-payload`,
      data,
    );
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

  // Ontology registry sync endpoints
  async listOntologies(): Promise<OntologyListResponse> {
    const response = await this.axiosInstance.get('/api/proxy/ontologies');
    return response.data;
  }

  async getOntologySyncSource(): Promise<OntologySyncSource> {
    const response = await this.axiosInstance.get('/api/proxy/ontologies/sync/source');
    return response.data;
  }

  async previewOntologySync(body: OntologySyncRequest): Promise<OntologySyncResponse> {
    const response = await this.axiosInstance.post('/api/proxy/ontologies/sync/preview', body);
    return response.data;
  }

  async runOntologySync(body: OntologySyncRequest): Promise<OntologySyncResponse> {
    const response = await this.axiosInstance.post('/api/proxy/ontologies/sync', body, {
      timeout: 15 * 60 * 1000,
    });
    return response.data;
  }

  async startOntologySyncJob(body: OntologySyncRequest): Promise<OntologySyncJobResponse> {
    const response = await this.axiosInstance.post('/api/proxy/ontologies/sync/jobs', body);
    return response.data;
  }

  async getOntologySyncJob(jobId: string): Promise<OntologySyncJobResponse> {
    const response = await this.axiosInstance.get(`/api/proxy/ontologies/sync/jobs/${jobId}`);
    return response.data;
  }

  async publishOntology(body: OntologyPublishRequest): Promise<OntologyPublishResponse> {
    const response = await this.axiosInstance.post('/api/proxy/ontologies/publish', body);
    return response.data;
  }

  async convertAndPublishOntologyDictionary(
    body: OntologyDictionaryConversionRequest,
  ): Promise<OntologyDictionaryConversionResponse> {
    const response = await this.axiosInstance.post(
      '/api/proxy/ontologies/conversions/dictionary-json-to-ttl',
      body,
    );
    return response.data;
  }

  async listOntologyCatalogTerms(
    ontologyFamily: string,
    country: string,
    version: string,
    params: {
      kind?: string;
      search?: string;
      limit?: number;
      cursor?: string;
      property_of?: string;
    } = {},
  ): Promise<LexiconCatalogTermsResponse> {
    const path = [ontologyFamily, country, version].map(encodeURIComponent).join('/');
    const response = await this.axiosInstance.get(`/api/proxy/lexicon/catalog/${path}/terms`, {
      params,
    });
    return response.data;
  }

  async validateRuleTerms(body: RuleTermValidationRequest): Promise<RuleTermValidationResponse> {
    const response = await this.axiosInstance.post(
      '/api/proxy/lexicon/catalog/rule-term-validation',
      body,
    );
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

  // Lexicon endpoints
  async getProfiles(): Promise<components['schemas']['LexiconProfileListResponse']> {
    const response = await this.axiosInstance.get('/api/proxy/lexicon/profiles');
    return response.data;
  }

  async getProfile(id: string): Promise<components['schemas']['LexiconProfileResponse']> {
    const response = await this.axiosInstance.get(`/api/proxy/lexicon/profiles/${id}`);
    return response.data;
  }

  async deriveLexiconProfile(
    request: components['schemas']['LexiconProfileDeriveRequest'],
  ): Promise<components['schemas']['LexiconProfileDeriveResponse']> {
    const response = await this.axiosInstance.post('/api/proxy/lexicon/profiles/derive', request);
    return response.data;
  }
}

// Create and export singleton instance
const apiClient = new ApiClient();
export default apiClient;
