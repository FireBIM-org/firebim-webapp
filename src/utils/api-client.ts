import axios, { AxiosInstance, type AxiosRequestConfig } from 'axios';

import { components } from '../types/api';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? '';

// Define User type based on the API schema
export type User = components['schemas']['User'];
export type IngestionJob = components['schemas']['IngestionJobResponse'];
export type IngestionReport = components['schemas']['IngestionReportResponse'];
export type IngestionRevision = components['schemas']['IngestionRevisionResponse'];
export type IngestionRevisions = components['schemas']['IngestionRevisionsResponse'];
export type IfcUploadSession = components['schemas']['IfcUploadResponse'];

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
export type RuleTermValidationField = 'target_class' | 'property_path' | 'value' | 'expression';
export type RuleTermValidationIssue = {
  rule_id: string;
  node_id: string;
  field: RuleTermValidationField;
  expected_kind: 'class' | 'property';
  value: string;
  code: 'unknown_term' | 'wrong_term_kind';
  message: string;
  /** the whole field value when `value` is one step of a path / expression */
  context?: string | null;
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
  node_count?: number | null;
  edge_count?: number | null;
  conversion_profile_id?: string | null;
  conversion_profile_name?: string | null;
  ingestion_backend?: 'legacy' | 'neo';
  status?: string;
  latest_job_id?: string | null;
  latest_successful_job_id?: string | null;
  latest_successful_graph_id?: string | null;
  latest_successful_revision_id?: string | null;
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
  conversion_profile_id?: string;
  conversion_profile_name?: string;
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

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.request<T>(config);
    return response.data;
  }

  // Get user profile from API server (goes through proxy which adds auth)
  async getCurrentUser(): Promise<User> {
    const response = await this.axiosInstance.get('/api/proxy/users/me');
    return response.data;
  }

  // IFC Models endpoints
  async getIngestionRevisions(signal?: AbortSignal): Promise<IngestionRevisions> {
    const first = await this.request<IngestionRevisions>({
      url: '/api/proxy/ifc-models/ingestion-revisions',
      params: { limit: 100 },
      signal,
    });
    const revisions = [...first.revisions];
    for (let offset = revisions.length; offset < first.count; offset += 100) {
      const page = await this.request<IngestionRevisions>({
        url: '/api/proxy/ifc-models/ingestion-revisions',
        params: { limit: 100, offset },
        signal,
      });
      revisions.push(...page.revisions);
      if (!page.revisions.length) break;
    }
    return { ...first, revisions };
  }

  initiateIfcUpload(
    data: components['schemas']['IfcUploadInitiate'],
    signal?: AbortSignal,
  ): Promise<IfcUploadSession> {
    return this.request({ method: 'POST', url: '/api/proxy/ifc-models/uploads', data, signal });
  }

  getIfcUpload(id: string, signal?: AbortSignal): Promise<IfcUploadSession> {
    return this.request({ url: `/api/proxy/ifc-models/uploads/${encodeURIComponent(id)}`, signal });
  }

  completeIfcUpload(id: string, signal?: AbortSignal): Promise<IngestionJob> {
    return this.request({
      method: 'POST',
      url: `/api/proxy/ifc-models/uploads/${encodeURIComponent(id)}/complete`,
      data: {},
      signal,
    });
  }

  transferIfcUpload(
    file: File,
    session: IfcUploadSession,
    onProgress?: (loaded: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!session.upload_url || signal?.aborted) {
        reject(new Error('Upload unavailable or cancelled'));
        return;
      }
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const finish = (error?: Error) => {
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      xhr.open('PUT', session.upload_url);
      xhr.timeout = 120_000;
      xhr.withCredentials = false;
      // A separate client deliberately sends no proxy auth, cookies or custom headers.
      // The browser sets Content-Length from the raw File, never from FormData.
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (event) => onProgress?.(Math.min(event.loaded, file.size), file.size);
      xhr.onload = () =>
        finish(
          xhr.status >= 200 && xhr.status < 300
            ? undefined
            : new Error(`Private upload failed (${xhr.status})`),
        );
      xhr.onerror = () =>
        finish(new Error('Private upload failed. Check storage connectivity and CORS.'));
      xhr.ontimeout = () => finish(new Error('Private upload timed out'));
      xhr.onabort = () => finish(new DOMException('Upload cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      xhr.send(file);
    });
  }

  getIngestionJob(id: string, signal?: AbortSignal): Promise<IngestionJob> {
    return this.request({ url: `/api/proxy/ifc-models/jobs/${encodeURIComponent(id)}`, signal });
  }

  getIngestionReport(id: string, signal?: AbortSignal): Promise<IngestionReport> {
    return this.request({
      url: `/api/proxy/ifc-models/jobs/${encodeURIComponent(id)}/report`,
      signal,
    });
  }

  getModelJobs(id: string, offset = 0, signal?: AbortSignal): Promise<IngestionJob[]> {
    return this.request({
      url: `/api/proxy/ifc-models/${encodeURIComponent(id)}/jobs`,
      params: { offset, limit: 50 },
      signal,
    });
  }

  retryIngestionJob(
    id: string,
    data: components['schemas']['IngestionRetryRequest'],
  ): Promise<IngestionJob> {
    return this.request({
      method: 'POST',
      url: `/api/proxy/ifc-models/jobs/${encodeURIComponent(id)}/retry`,
      data,
    });
  }

  cancelIngestionJob(id: string): Promise<IngestionJob> {
    return this.request({
      method: 'POST',
      url: `/api/proxy/ifc-models/jobs/${encodeURIComponent(id)}/cancel`,
    });
  }

  reprocessModel(
    id: string,
    data: components['schemas']['IngestionReprocessRequest'],
  ): Promise<IngestionJob> {
    return this.request({
      method: 'POST',
      url: `/api/proxy/ifc-models/${encodeURIComponent(id)}/reprocess`,
      data,
    });
  }

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
