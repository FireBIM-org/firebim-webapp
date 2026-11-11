import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '@/utils/api-client';

import type { TranslationContract, TranslationProfile, TranslationProfileSummary } from './types';

import {
  archiveTranslationProfile,
  createTranslationProfile,
  extractTranslationMappings,
  getTranslationProfile,
  listTranslationProfiles,
  publishTranslationProfile,
  translationErrorMessage,
  updateTranslationProfile,
  validateTranslationProfile,
} from './api';

vi.mock('@/utils/api-client', () => ({
  default: { request: vi.fn() },
}));

const contract: TranslationContract = {
  kind: 'ifc_translation',
  contract_version: '1',
  source: {
    schema: 'IFC4',
    adapter: 'native_ifc',
    extraction_contract: 'native-ifc-record/1',
  },
  destination_release: '2026.09.04',
  destination_modules: [
    {
      family: 'building',
      country: 'DK',
      version: '2026.09.04',
      ontology_iri: null,
      version_iri: null,
      sha256: null,
      artifact_ref: null,
      dependencies: ['unresolved-module'],
    },
  ],
  mappings: [
    {
      id: 'fire-rating',
      enabled: false,
      review_state: 'unresolved',
      seed_provenance: { source: 'pilot', extra: [null, true, { version: 1 }] },
      definition: {
        raw_value: 'REI60',
        unsupported: { nested: ['unknown', 0, false, null] },
        numeric_resistance: null,
      },
    },
  ],
  optional_rule_ids: [],
};

const profile: TranslationProfile = {
  id: 'ifct_pilot',
  kind: 'ifc_translation',
  name: 'IFC4 pilot',
  description: null,
  status: 'draft',
  generation: 3,
  contract,
  created_at: '2026-09-04T10:00:00Z',
  updated_at: '2026-09-04T11:00:00Z',
  revision_refs: [],
};

describe('translation draft API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('explicitly opts into translation-only listing and unwraps profiles', async () => {
    const summary: TranslationProfileSummary = {
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      status: profile.status,
      generation: profile.generation,
      description: null,
      updated_at: profile.updated_at,
    };
    vi.mocked(apiClient.request).mockResolvedValue({ count: 1, profiles: [summary] });

    expect(await listTranslationProfiles()).toEqual([summary]);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/api/proxy/lexicon/profiles',
      params: { kind: 'ifc_translation' },
    });
  });

  it('unwraps profile_record on open without interpreting opaque or incomplete data', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: profile });

    const result = await getTranslationProfile(profile.id);

    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/api/proxy/lexicon/profiles/ifct_pilot',
    });
    expect(result).toBe(profile);
    expect(result.contract).toEqual(contract);
    expect(result.contract.mappings[0].definition.raw_value).toBe('REI60');
    expect(result.contract.mappings[0].definition.numeric_resistance).toBeNull();
  });

  it('creates a rule-free draft and leaves the default contract to the server', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: profile });

    expect(await createTranslationProfile({ name: 'IFC4 pilot' })).toBe(profile);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: '/api/proxy/lexicon/profiles',
      data: {
        kind: 'ifc_translation',
        name: 'IFC4 pilot',
      },
    });
  });

  it('retains a supplied contract and explicit null description on create', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: profile });

    expect(
      await createTranslationProfile({ name: profile.name, description: null, contract }),
    ).toBe(profile);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: '/api/proxy/lexicon/profiles',
      data: {
        kind: 'ifc_translation',
        name: profile.name,
        description: null,
        contract,
      },
    });
    expect(vi.mocked(apiClient.request).mock.calls[0][0].data.contract).toBe(contract);
  });

  it('sends the exact expected generation and whole contract on save', async () => {
    const saved = { ...profile, generation: 4 };
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: saved });
    const input = { expected_generation: 3, name: 'Revised pilot', description: null, contract };

    expect(await updateTranslationProfile(profile.id, input)).toBe(saved);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'PUT',
      url: '/api/proxy/lexicon/profiles/ifct_pilot',
      data: input,
    });
    expect(vi.mocked(apiClient.request).mock.calls[0][0].data.contract).toBe(contract);
  });

  it('does not turn omitted update fields into null or an empty contract', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: profile });

    await updateTranslationProfile(profile.id, { expected_generation: 3, name: 'Only rename' });

    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'PUT',
      url: '/api/proxy/lexicon/profiles/ifct_pilot',
      data: {
        expected_generation: 3,
        name: 'Only rename',
      },
    });
  });

  it('archives with generation in the query and returns the retained archived record', async () => {
    const archived = { ...profile, status: 'archived' as const, generation: 4 };
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: archived });

    expect(await archiveTranslationProfile(profile.id, 3)).toBe(archived);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'DELETE',
      url: '/api/proxy/lexicon/profiles/ifct_pilot',
      params: { expected_generation: 3 },
    });
  });

  it('validates only a saved generation and returns the report without a profile wrapper', async () => {
    const report = {
      profile_id: 'ifct_a/b?x=1',
      generation: 3,
      authoring_valid: false,
      runtime_available: false,
      publish_ready: false,
      steps: [
        { id: 'destination_ontologies', status: 'passed', message: 'Pinned modules resolved.' },
        { id: 'mappings', status: 'failed', message: 'Mapping authoring errors found.' },
        { id: 'publication', status: 'failed', message: 'Authoring checks must pass.' },
      ],
      diagnostics: [
        {
          code: 'missing_predicate',
          severity: 'error',
          mapping_id: 'fire-rating',
          field_path: 'mappings[0].definition.predicate',
          message: 'A destination predicate is required.',
        },
      ],
    };
    vi.mocked(apiClient.request).mockResolvedValue(report);

    expect(await validateTranslationProfile('ifct_a/b?x=1', 3)).toBe(report);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: '/api/proxy/lexicon/profiles/ifct_a%2Fb%3Fx%3D1/validate',
      data: { expected_generation: 3 },
    });
  });

  it.each([404, 409, 502])('propagates validation failure %s without retrying', async (status) => {
    const failure = { response: { status, data: { detail: 'Draft checks unavailable' } } };
    vi.mocked(apiClient.request).mockRejectedValue(failure);

    await expect(validateTranslationProfile(profile.id, 3)).rejects.toBe(failure);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: '/api/proxy/lexicon/profiles/ifct_pilot/validate',
      data: { expected_generation: 3 },
    });
  });

  it('publishes the encoded saved generation and returns the revision directly, without runtime input', async () => {
    const revision = {
      revision_id: 'revision-1',
      published_at: '2026-10-26T12:00:00Z',
      content_digest: 'sha256:revision',
      content: {
        snapshot_version: '1',
        profile_id: 'ifct_a/b?x=1',
        draft_generation: 3,
        name: profile.name,
        description: null,
        source_contract: contract,
        contract,
        compiled_mappings: {},
        ontology_artifacts: [],
        diagnostics: [],
        compiler_version: 'ifc4-module-compiler/1',
        source_schema_provenance: {},
      },
    };
    vi.mocked(apiClient.request).mockResolvedValue(revision);

    expect(await publishTranslationProfile('ifct_a/b?x=1', 3)).toBe(revision);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: '/api/proxy/lexicon/profiles/ifct_a%2Fb%3Fx%3D1/publish',
      data: { expected_generation: 3 },
    });
  });

  it.each([404, 409, 422, 502, null])(
    'propagates publish failure %s without retrying',
    async (status) => {
      const failure =
        status === null
          ? new Error('Network Error')
          : {
              response: { status, data: { detail: 'Publication failed' } },
            };
      vi.mocked(apiClient.request).mockRejectedValue(failure);

      await expect(publishTranslationProfile(profile.id, 3)).rejects.toBe(failure);
      expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
        method: 'POST',
        url: '/api/proxy/lexicon/profiles/ifct_pilot/publish',
        data: { expected_generation: 3 },
      });
    },
  );

  it('requests a read-only extraction preview for the encoded saved generation', async () => {
    const report = {
      profile_id: 'ifct_a/b?x=1',
      generation: 3,
      mappings: contract.mappings,
      skipped_existing: 2,
      diagnostics: [],
    };
    vi.mocked(apiClient.request).mockResolvedValue(report);

    expect(await extractTranslationMappings(report.profile_id, 3)).toBe(report);
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: '/api/proxy/lexicon/profiles/ifct_a%2Fb%3Fx%3D1/extract-mappings',
      data: { expected_generation: 3 },
    });
  });

  it.each([401, 403, 409, 502])(
    'propagates extraction failure %s without retrying',
    async (status) => {
      const failure = { response: { status, data: { detail: 'Extraction unavailable' } } };
      vi.mocked(apiClient.request).mockRejectedValue(failure);

      await expect(extractTranslationMappings(profile.id, 3)).rejects.toBe(failure);
      expect(apiClient.request).toHaveBeenCalledOnce();
    },
  );

  it('encodes the profile ID as a single path segment', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ profile_record: profile });

    await getTranslationProfile('ifct_a/b?x=1');

    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/api/proxy/lexicon/profiles/ifct_a%2Fb%3Fx%3D1',
    });
  });

  it('propagates conflicts without retrying a save or an archive', async () => {
    const error = { response: { status: 409, data: { detail: 'Generation mismatch' } } };
    vi.mocked(apiClient.request).mockRejectedValue(error);

    await expect(updateTranslationProfile(profile.id, { expected_generation: 3 })).rejects.toBe(
      error,
    );
    await expect(archiveTranslationProfile(profile.id, 3)).rejects.toBe(error);
    expect(apiClient.request).toHaveBeenCalledTimes(2);
    expect(apiClient.request).toHaveBeenNthCalledWith(1, {
      method: 'PUT',
      url: '/api/proxy/lexicon/profiles/ifct_pilot',
      data: { expected_generation: 3 },
    });
    expect(apiClient.request).toHaveBeenNthCalledWith(2, {
      method: 'DELETE',
      url: '/api/proxy/lexicon/profiles/ifct_pilot',
      params: { expected_generation: 3 },
    });
  });
});

describe('translationErrorMessage', () => {
  it('renders structured publication diagnostics alongside the error message', () => {
    const message = translationErrorMessage({
      response: {
        status: 422,
        data: {
          detail: {
            code: 'publication_invalid',
            message: 'Publication validation failed.',
            diagnostics: [
              {
                code: 'invalid_selector',
                severity: 'error',
                mapping_id: 'wall',
                field_path: 'mappings[0].definition',
                message: 'Unsupported selector.',
              },
            ],
          },
        },
      },
    });
    expect(message).toContain('Publication validation failed.');
    expect(message).toContain('invalid_selector');
    expect(message).toContain('wall');
    expect(message).toContain('mappings[0].definition');
    expect(message).toContain('Unsupported selector.');
    expect(message).not.toContain('[object Object]');
  });

  it('explains conflicts and recommends reopening before saving again', () => {
    const message = translationErrorMessage({
      response: { status: 409, data: { detail: 'Generation mismatch' } },
    });

    expect(message).toMatch(/generation mismatch/i);
    expect(message).toMatch(/reopen|reload/i);
    expect(message).toMatch(/local|unsaved|copy/i);
  });

  it('renders FastAPI validation arrays with field locations', () => {
    const message = translationErrorMessage({
      response: {
        status: 422,
        data: {
          detail: [
            {
              loc: ['body', 'name'],
              msg: 'String should have at least 1 character',
              type: 'too_short',
            },
            { loc: ['body', 'contract', 'mappings', 0, 'id'], msg: 'Field required' },
          ],
        },
      },
    });

    expect(message).toContain('name');
    expect(message).toContain('String should have at least 1 character');
    expect(message).toContain('contract.mappings.0.id');
    expect(message).toContain('Field required');
    expect(message).not.toContain('[object Object]');
  });

  it.each([
    ['expected_generation is required', 'expected_generation is required'],
    [{ code: 'invalid_pin', message: 'Module pin is incomplete' }, 'Module pin is incomplete'],
    [{ reason: 'unknown shape', nested: { field: 'contract' } }, 'unknown shape'],
  ])('preserves string and object backend details: %j', (detail, expected) => {
    const message = translationErrorMessage({ response: { status: 422, data: { detail } } });
    expect(message).toContain(expected);
    expect(message).not.toContain('[object Object]');
  });

  it('handles a string detail even when no HTTP status is available', () => {
    expect(translationErrorMessage({ response: { data: { detail: 'Invalid draft' } } })).toContain(
      'Invalid draft',
    );
  });

  it.each([401, 403])('gives actionable authentication guidance for %s', (status) => {
    const message = translationErrorMessage({ response: { status, data: {} } });
    expect(message).toMatch(/sign in|permission|access/i);
  });

  it.each([null, undefined, {}, 42])('uses a readable fallback for %j', (error) => {
    expect(translationErrorMessage(error)).toMatch(/translation|draft/i);
  });

  it('retains ordinary network errors and backend failure messages', () => {
    expect(translationErrorMessage(new Error('Network Error'))).toContain('Network Error');
    expect(
      translationErrorMessage({
        response: { status: 502, data: { detail: 'Storage unavailable' } },
      }),
    ).toContain('Storage unavailable');
    expect(translationErrorMessage('Offline')).toContain('Offline');
  });
});
