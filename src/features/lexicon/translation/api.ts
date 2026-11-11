import apiClient from '@/utils/api-client';

import type {
  TranslationContract,
  TranslationMappingExtractionReport,
  TranslationProfile,
  TranslationProfileSummary,
  TranslationPublishedRevision,
  TranslationValidationReport,
} from './types';

const profilesPath = '/api/proxy/lexicon/profiles';

type ProfileResponse = { profile_record: TranslationProfile };
type ProfileListResponse = { count: number; profiles: TranslationProfileSummary[] };

export async function listTranslationProfiles(): Promise<TranslationProfileSummary[]> {
  const response = await apiClient.request<ProfileListResponse>({
    method: 'GET',
    url: profilesPath,
    params: { kind: 'ifc_translation' },
  });
  return response.profiles;
}

export async function getTranslationProfile(id: string): Promise<TranslationProfile> {
  const response = await apiClient.request<ProfileResponse>({
    method: 'GET',
    url: `${profilesPath}/${encodeURIComponent(id)}`,
  });
  return response.profile_record;
}

export async function createTranslationProfile(input: {
  name: string;
  description?: string | null;
  contract?: TranslationContract;
}): Promise<TranslationProfile> {
  const response = await apiClient.request<ProfileResponse>({
    method: 'POST',
    url: profilesPath,
    data: {
      ...input,
      kind: 'ifc_translation',
    },
  });
  return response.profile_record;
}

export async function updateTranslationProfile(
  id: string,
  input: {
    expected_generation: number;
    name?: string;
    description?: string | null;
    contract?: TranslationContract;
  },
): Promise<TranslationProfile> {
  const response = await apiClient.request<ProfileResponse>({
    method: 'PUT',
    url: `${profilesPath}/${encodeURIComponent(id)}`,
    data: input,
  });
  return response.profile_record;
}

export async function archiveTranslationProfile(
  id: string,
  expectedGeneration: number,
): Promise<TranslationProfile> {
  const response = await apiClient.request<ProfileResponse>({
    method: 'DELETE',
    url: `${profilesPath}/${encodeURIComponent(id)}`,
    params: { expected_generation: expectedGeneration },
  });
  return response.profile_record;
}

export async function validateTranslationProfile(
  id: string,
  expectedGeneration: number,
): Promise<TranslationValidationReport> {
  return apiClient.request<TranslationValidationReport>({
    method: 'POST',
    url: `${profilesPath}/${encodeURIComponent(id)}/validate`,
    data: { expected_generation: expectedGeneration },
  });
}

export async function publishTranslationProfile(
  id: string,
  expectedGeneration: number,
): Promise<TranslationPublishedRevision> {
  return apiClient.request<TranslationPublishedRevision>({
    method: 'POST',
    url: `${profilesPath}/${encodeURIComponent(id)}/publish`,
    data: { expected_generation: expectedGeneration },
  });
}

export async function extractTranslationMappings(
  id: string,
  expectedGeneration: number,
): Promise<TranslationMappingExtractionReport> {
  return apiClient.request<TranslationMappingExtractionReport>({
    method: 'POST',
    url: `${profilesPath}/${encodeURIComponent(id)}/extract-mappings`,
    data: { expected_generation: expectedGeneration },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detailMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(detailMessage).filter(Boolean).join('; ');
  if (!isRecord(detail)) return '';

  const message = typeof detail.msg === 'string' ? detail.msg : detail.message;
  if (typeof message === 'string') {
    const location = Array.isArray(detail.loc)
      ? detail.loc.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
      : [detail.mapping_id, detail.field_path, detail.code]
          .filter((part) => typeof part === 'string' && part)
          .join(' · ');
    const diagnostics = Array.isArray(detail.diagnostics) ? detailMessage(detail.diagnostics) : '';
    return [location ? `${location}: ${message}` : message, diagnostics].filter(Boolean).join('; ');
  }
  if (Array.isArray(detail.diagnostics)) return detailMessage(detail.diagnostics);
  try {
    return JSON.stringify(detail);
  } catch {
    return '';
  }
}

export function translationErrorMessage(error: unknown): string {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const data = response && isRecord(response.data) ? response.data : undefined;
  const detail = detailMessage(data?.detail);

  if (response?.status === 409) {
    return `${detail || 'The translation draft has changed on the server.'} Keep a copy of your local edits, reopen the draft to load the latest generation, then reapply your changes before saving again.`;
  }
  if (response?.status === 401) {
    return `Your session has expired. Sign in again to access translation drafts.${detail ? ` ${detail}` : ''}`;
  }
  if (response?.status === 403) {
    return `You do not have permission to access this translation draft.${detail ? ` ${detail}` : ''}`;
  }
  if (detail) return detail;
  if (isRecord(error) && typeof error.message === 'string' && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The translation draft request failed. Please try again.';
}
