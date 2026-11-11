// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requests = vi.hoisted(() => ({
  listTranslationProfiles: vi.fn(),
  getTranslationProfile: vi.fn(),
  updateTranslationProfile: vi.fn(),
  validateTranslationProfile: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  ...requests,
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ events: { on: vi.fn(), off: vi.fn() } }),
}));
vi.mock('@/features/ontologies/library', () => ({
  getOntologyLibrary: () => [],
  refreshOntologyLibrary: async () => [],
}));

import type {
  TranslationDraftMapping,
  TranslationProfile,
  TranslationValidationReport,
} from './types';

import { emptyDraft, writeCheckpoint } from './draft';
import TranslationWorkspace from './TranslationWorkspace';

const mappings: TranslationDraftMapping[] = [
  {
    id: 'failing-module',
    enabled: true,
    review_state: 'accepted' as const,
    seed_provenance: { kind: 'ontology_module', declaration_iri: 'urn:module:System' },
    definition: { language: 'fbo-module-suggestion/1', original: { value: 'REI60' } },
  },
  { id: 'failing-manual', enabled: true, review_state: 'unresolved' as const, definition: {} },
  { id: 'warning-only', enabled: true, review_state: 'accepted' as const, definition: {} },
  { id: 'valid', enabled: true, review_state: 'accepted' as const, definition: {} },
  { id: 'already-disabled', enabled: false, review_state: 'rejected' as const, definition: {} },
];

function profile(): TranslationProfile {
  return {
    id: 'ifct_pilot',
    name: 'Pilot',
    kind: 'ifc_translation',
    status: 'draft',
    generation: 13,
    contract: { ...emptyDraft().contract, mappings },
    created_at: '2026-10-23T12:00:00Z',
    updated_at: '2026-10-23T12:00:00Z',
    revision_refs: [],
  };
}

function report(): TranslationValidationReport {
  return {
    profile_id: 'ifct_pilot',
    generation: 13,
    authoring_valid: false,
    runtime_available: false,
    publish_ready: false,
    steps: [{ id: 'mappings', status: 'failed', message: 'Mapping checks failed.' }],
    diagnostics: [
      {
        code: 'system_required',
        severity: 'error',
        mapping_id: 'failing-module',
        field_path: 'mappings[0]',
        message: 'System definition needed.',
      },
      {
        code: 'another_error',
        severity: 'error',
        mapping_id: 'failing-module',
        field_path: 'mappings[0]',
        message: 'Entity binding needed.',
      },
      {
        code: 'review_required',
        severity: 'error',
        mapping_id: 'failing-manual',
        field_path: 'mappings[1]',
        message: 'Review is needed.',
      },
      {
        code: 'warning',
        severity: 'warning',
        mapping_id: 'warning-only',
        field_path: 'mappings[2]',
        message: 'Warning only.',
      },
      {
        code: 'excluded',
        severity: 'info',
        mapping_id: 'valid',
        field_path: 'mappings[3]',
        message: 'Information only.',
      },
      {
        code: 'old_error',
        severity: 'error',
        mapping_id: 'already-disabled',
        field_path: 'mappings[4]',
        message: 'Already disabled.',
      },
      {
        code: 'unknown',
        severity: 'error',
        mapping_id: 'unknown-id',
        field_path: 'mappings',
        message: 'Unknown mapping.',
      },
      {
        code: 'dependency',
        severity: 'error',
        mapping_id: null,
        field_path: 'modules',
        message: 'Missing dependency.',
      },
    ],
  };
}

async function validate() {
  render(<TranslationWorkspace userId="alice" />);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
}

function editorMappings() {
  return JSON.parse(
    (screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement).value,
  );
}

describe('disable failing mappings after validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.listTranslationProfiles.mockResolvedValue([]);
    requests.getTranslationProfile.mockResolvedValue(profile());
    requests.validateTranslationProfile.mockResolvedValue(report());
    requests.updateTranslationProfile.mockImplementation(async (_id, payload) => ({
      ...profile(),
      ...payload,
      generation: 14,
    }));
  });
  afterEach(cleanup);

  it('lists only enabled mappings with errors, without modifying anything before confirmation', async () => {
    await validate();
    const dialog = await screen.findByRole('dialog', { name: 'Disable failing mappings?' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect(within(dialog).getByText('failing-module')).toBeTruthy();
    expect(within(dialog).getByText('System definition needed.')).toBeTruthy();
    expect(within(dialog).getByText('Entity binding needed.')).toBeTruthy();
    expect(within(dialog).getByText('failing-manual')).toBeTruthy();
    expect(within(dialog).queryByText('warning-only')).toBeNull();
    const cancel = within(dialog).getByRole('button', { name: 'Keep mappings enabled' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(editorMappings()).toEqual(mappings);
    expect(screen.getByRole('region', { name: 'Draft checks' })).toBeTruthy();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Validate draft' })),
    );
  });

  it('disables only failing entries locally, preserves snapshots and saves with the checked generation', async () => {
    await validate();
    const dialog = await screen.findByRole('dialog', { name: 'Disable failing mappings?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable failing mappings' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const expected = mappings.map((mapping) =>
      mapping.id.startsWith('failing-') ? { ...mapping, enabled: false } : mapping,
    );
    expect(editorMappings()).toEqual(expected);
    expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    expect(screen.getByText('Unsaved changes. Save explicitly before leaving.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 14/);
    expect(requests.updateTranslationProfile).toHaveBeenCalledWith(
      'ifct_pilot',
      expect.objectContaining({
        expected_generation: 13,
        contract: { ...emptyDraft().contract, mappings: expected },
      }),
    );
    expect(requests.validateTranslationProfile).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    requests.validateTranslationProfile.mockResolvedValue({ ...report(), generation: 14 });
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await screen.findByRole('region', { name: 'Draft checks' });
    expect(requests.validateTranslationProfile).toHaveBeenLastCalledWith('ifct_pilot', 14);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('supports Escape cancellation and offers the choice again on a fresh validation', async () => {
    await validate();
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Keep mappings enabled' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(editorMappings()).toEqual(mappings);
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    expect(await screen.findByRole('dialog', { name: 'Disable failing mappings?' })).toBeTruthy();
  });

  it.each([
    'passed',
    'non-mapping-errors',
    'warnings',
    'unknown-id',
    'already-disabled',
    'http-error',
  ])('does not offer mapping changes for %s', async (scenario) => {
    const result = report();
    if (scenario === 'passed') result.authoring_valid = true;
    else if (scenario === 'http-error')
      requests.validateTranslationProfile.mockRejectedValue(new Error('Validation unavailable'));
    else
      result.diagnostics = result.diagnostics.filter((item) =>
        scenario === 'non-mapping-errors'
          ? item.mapping_id === null
          : scenario === 'warnings'
            ? item.severity !== 'error'
            : item.mapping_id === scenario,
      );
    if (scenario !== 'http-error') requests.validateTranslationProfile.mockResolvedValue(result);
    await validate();
    if (scenario === 'http-error') await screen.findByRole('alert');
    else await screen.findByRole('region', { name: 'Draft checks' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(editorMappings()).toEqual(mappings);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
  });

  it('dismisses the choice on an account switch without changing the next account draft', async () => {
    const view = render(<TranslationWorkspace userId="alice" />);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await screen.findByRole('dialog');
    view.rerender(<TranslationWorkspace userId="bob" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false),
    );
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('');
    expect(editorMappings()).toEqual([]);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
  });
});
