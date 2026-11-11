// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requests = vi.hoisted(() => ({
  listTranslationProfiles: vi.fn(),
  getTranslationProfile: vi.fn(),
  updateTranslationProfile: vi.fn(),
  validateTranslationProfile: vi.fn(),
  publishTranslationProfile: vi.fn(),
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
  TranslationProfile,
  TranslationPublishedRevision,
  TranslationValidationReport,
} from './types';

import { emptyDraft, readCheckpoint, writeCheckpoint } from './draft';
import TranslationWorkspace from './TranslationWorkspace';

function profile(overrides: Partial<TranslationProfile> = {}): TranslationProfile {
  return {
    id: 'ifct_pilot',
    name: 'Pilot',
    description: null,
    kind: 'ifc_translation',
    status: 'draft',
    generation: 3,
    contract: {
      ...emptyDraft().contract,
      mappings: [
        {
          id: 'opaque',
          enabled: false,
          review_state: 'unresolved',
          definition: { raw_value: 'REI60', retained: [null, false, { nested: 7 }] },
        },
      ],
    },
    created_at: '2026-10-26T12:00:00Z',
    updated_at: '2026-10-26T12:00:00Z',
    revision_refs: [],
    ...overrides,
  };
}

function report(overrides: Partial<TranslationValidationReport> = {}): TranslationValidationReport {
  return {
    profile_id: 'ifct_pilot',
    generation: 3,
    authoring_valid: true,
    runtime_available: false,
    publish_ready: true,
    steps: [{ id: 'publication', status: 'passed', message: 'Ready to publish.' }],
    diagnostics: [],
    ...overrides,
  };
}

function revision(): TranslationPublishedRevision {
  return {
    revision_id: 'revision-1',
    published_at: '2026-10-26T12:01:00Z',
    content_digest: 'sha256:confirmed',
    content: {
      snapshot_version: '1',
      profile_id: 'ifct_pilot',
      draft_generation: 3,
      name: 'Pilot',
      description: null,
      source_contract: emptyDraft().contract,
      contract: emptyDraft().contract,
      compiled_mappings: {},
      ontology_artifacts: [],
      diagnostics: [],
      compiler_version: 'ifc4-module-compiler/1',
      source_schema_provenance: {},
    },
  };
}

function publishButton() {
  return screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement;
}

async function openValidated() {
  render(<TranslationWorkspace userId="alice" />);
  await screen.findByText('Generation 3 · draft');
  fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
  await screen.findByRole('region', { name: 'Draft checks' });
  await waitFor(() => expect(publishButton().disabled).toBe(false));
}

describe('immutable translation publication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.listTranslationProfiles.mockResolvedValue([profile()]);
    requests.getTranslationProfile.mockResolvedValue(profile());
    requests.validateTranslationProfile.mockResolvedValue(report());
    requests.publishTranslationProfile.mockResolvedValue(revision());
    requests.updateTranslationProfile.mockResolvedValue(
      profile({ generation: 5, name: 'Next edit' }),
    );
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('requires a saved, clean, active draft and matching publish-ready validation; never publishes automatically', async () => {
    localStorage.clear();
    render(<TranslationWorkspace userId="alice" />);
    await screen.findByRole('button', { name: 'Save draft' });
    expect(publishButton().disabled).toBe(true);
    fireEvent.click(publishButton());
    fireEvent.click(await screen.findByRole('button', { name: /Pilot Draft/ }));
    await screen.findByText('Generation 3 · draft');
    expect(publishButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Local' } });
    expect(publishButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Pilot' } });
    requests.validateTranslationProfile.mockResolvedValue(
      report({ publish_ready: false, authoring_valid: false }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await screen.findByRole('region', { name: 'Draft checks' });
    expect(publishButton().disabled).toBe(true);
    requests.validateTranslationProfile.mockResolvedValue(report());
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Local' } });
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Pilot' } });
    expect(publishButton().disabled).toBe(true);
    expect(requests.publishTranslationProfile).not.toHaveBeenCalled();
  });

  it('blocks publication when publish-ready validation contradicts invalid authoring', async () => {
    requests.validateTranslationProfile.mockResolvedValue(report({ authoring_valid: false }));
    render(<TranslationWorkspace userId="alice" />);
    await screen.findByText('Generation 3 · draft');
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await screen.findByRole('region', { name: 'Draft checks' });
    expect(publishButton().disabled).toBe(true);
    fireEvent.click(publishButton());
    expect(requests.publishTranslationProfile).not.toHaveBeenCalled();
  });

  it.each([{ status: 'archived' as const }, { generation: 4 }])(
    'blocks publication for an archived draft or mismatched report: %j',
    async (override) => {
      requests.getTranslationProfile.mockResolvedValue(profile(override));
      render(<TranslationWorkspace userId="alice" />);
      await screen.findByText(/Generation \d · (draft|archived)/);
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      if (!override.status) await screen.findByRole('alert');
      expect(publishButton().disabled).toBe(true);
      fireEvent.click(publishButton());
      expect(requests.publishTranslationProfile).not.toHaveBeenCalled();
    },
  );

  it('confirms the immutable revision, reloads generation, and saves the next edit safely', async () => {
    await openValidated();
    requests.getTranslationProfile.mockResolvedValue(profile({ generation: 4 }));
    fireEvent.click(publishButton());
    const result = await screen.findByRole('region', { name: 'Published revision confirmed' });
    expect(within(result).getByText('revision-1')).toBeTruthy();
    expect(within(result).getByText('sha256:confirmed')).toBeTruthy();
    expect(within(result).getByText('Draft generation 3')).toBeTruthy();
    expect(within(result).getByText(/Upload execution is unavailable/)).toBeTruthy();
    await screen.findByText('Generation 4 · draft');
    expect(requests.publishTranslationProfile).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 3);
    expect(requests.getTranslationProfile).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    expect(publishButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Next edit' } });
    expect(screen.queryByRole('region', { name: 'Published revision confirmed' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 5/);
    expect(requests.updateTranslationProfile).toHaveBeenCalledWith(
      'ifct_pilot',
      expect.objectContaining({ expected_generation: 4, name: 'Next edit' }),
    );
  });

  it.each([404, 409, 422, 502])(
    'preserves the editor and exposes diagnostics on publication failure %s',
    async (status) => {
      await openValidated();
      requests.publishTranslationProfile.mockRejectedValue({
        response: {
          status,
          data: {
            detail: {
              code:
                status === 502
                  ? 'translation_validation_unavailable'
                  : 'translation_publication_rejected',
              message: 'Publication rejected.',
              diagnostics: [
                {
                  code: 'invalid_selector',
                  severity: 'error',
                  mapping_id: 'wall',
                  field_path: 'mappings[0]',
                  message: 'Selector needs review.',
                },
              ],
            },
          },
        },
      });
      const mappings = (
        screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement
      ).value;
      fireEvent.click(publishButton());
      const error = await screen.findByRole('alert');
      expect(error.textContent).toContain('Publication rejected.');
      expect(error.textContent).toContain('Selector needs review.');
      expect(error.textContent).toContain('wall');
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Pilot');
      expect(
        (screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement).value,
      ).toBe(mappings);
      expect(screen.queryByRole('region', { name: 'Published revision confirmed' })).toBeNull();
      expect(publishButton().disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Retry publication' })).toBeNull();
      expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false);
      fireEvent.change(screen.getByLabelText('Profile name'), {
        target: { value: 'Preserved local edit' },
      });
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe(
        'Preserved local edit',
      );
      expect(requests.getTranslationProfile).toHaveBeenCalledOnce();
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    },
  );

  it('keeps confirmed publication when reload fails and blocks stale edits/saves until explicit reload', async () => {
    await openValidated();
    requests.getTranslationProfile.mockRejectedValue(new Error('Reload offline'));
    fireEvent.click(publishButton());
    await screen.findByRole('region', { name: 'Published revision confirmed' });
    expect((await screen.findByRole('alert')).textContent).toContain('Reload before further edits');
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    requests.getTranslationProfile.mockResolvedValue(profile({ generation: 4 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await screen.findByText('Generation 4 · draft');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false);
    expect(screen.getByRole('region', { name: 'Published revision confirmed' })).toBeTruthy();
  });

  it('does not unlock a confirmed publication on a stale reload response', async () => {
    await openValidated();
    fireEvent.click(publishButton());
    await screen.findByRole('alert');
    expect(screen.getByRole('region', { name: 'Published revision confirmed' })).toBeTruthy();
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await waitFor(() => expect(requests.getTranslationProfile).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    expect(screen.getByRole('region', { name: 'Published revision confirmed' })).toBeTruthy();
  });

  it('offers an explicit same-generation retry for an unknown network outcome, never automatically retries', async () => {
    await openValidated();
    requests.publishTranslationProfile.mockRejectedValueOnce(new Error('Network Error'));
    fireEvent.click(publishButton());
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Publication outcome is unknown',
    );
    expect(requests.publishTranslationProfile).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    requests.getTranslationProfile.mockResolvedValue(profile({ generation: 4 }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    await screen.findByRole('region', { name: 'Published revision confirmed' });
    await screen.findByText('Generation 4 · draft');
    expect(requests.publishTranslationProfile.mock.calls).toEqual([
      ['ifct_pilot', 3],
      ['ifct_pilot', 3],
    ]);
  });

  it('locks edits after a generic 502 lost commit response, retries generation 3 only explicitly, then saves generation 4 safely', async () => {
    await openValidated();
    requests.publishTranslationProfile.mockRejectedValueOnce({
      response: { status: 502, data: { detail: { message: 'Commit response lost.' } } },
    });
    const mappings = (
      screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement
    ).value;
    fireEvent.click(publishButton());
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('Publication outcome is unknown');
    expect(error.textContent).toContain('Commit response lost.');
    expect(requests.publishTranslationProfile).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 3);
    expect(requests.getTranslationProfile).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: 'Published revision confirmed' })).toBeNull();
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Blocked edit' } });
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Pilot');
    expect(
      (screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement).value,
    ).toBe(mappings);
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    requests.getTranslationProfile.mockResolvedValue(profile({ generation: 4 }));
    const retry = screen.getByRole('button', { name: 'Retry publication' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    const result = await screen.findByRole('region', { name: 'Published revision confirmed' });
    expect(within(result).getByText('revision-1')).toBeTruthy();
    await screen.findByText('Generation 4 · draft');
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Retry publication' })).toBeNull();
    expect(requests.getTranslationProfile).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Next edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 5/);
    expect(requests.updateTranslationProfile).toHaveBeenCalledExactlyOnceWith(
      'ifct_pilot',
      expect.objectContaining({ expected_generation: 4, name: 'Next edit' }),
    );
    expect(requests.publishTranslationProfile.mock.calls).toEqual([
      ['ifct_pilot', 3],
      ['ifct_pilot', 3],
    ]);
  });

  it('locks duplicate clicks and all editing while publishing, and ignores a late result after account change', async () => {
    let finish!: (value: TranslationPublishedRevision) => void;
    requests.publishTranslationProfile.mockReturnValue(
      new Promise<TranslationPublishedRevision>((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<TranslationWorkspace userId="alice" />);
    await screen.findByText('Generation 3 · draft');
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    fireEvent.click(publishButton());
    fireEvent.click(publishButton());
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    for (const name of ['New draft', 'Reload server draft', 'Archive draft', 'Validate draft']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.publishTranslationProfile).toHaveBeenCalledOnce();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    view.rerender(<TranslationWorkspace userId="bob" />);
    await screen.findByRole('button', { name: 'Save draft' });
    await act(async () => {
      finish(revision());
    });
    expect(screen.queryByRole('region', { name: 'Published revision confirmed' })).toBeNull();
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('');
    expect(readCheckpoint(localStorage, 'bob')).toBeNull();
    expect(requests.getTranslationProfile).toHaveBeenCalledOnce();
  });

  it('keeps the lock through post-publication reload and ignores its late response for another account', async () => {
    let finishReload!: (value: TranslationProfile) => void;
    const view = render(<TranslationWorkspace userId="alice" />);
    await screen.findByText('Generation 3 · draft');
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    requests.getTranslationProfile.mockReturnValueOnce(
      new Promise<TranslationProfile>((resolve) => {
        finishReload = resolve;
      }),
    );
    fireEvent.click(publishButton());
    await screen.findByRole('region', { name: 'Published revision confirmed' });
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    fireEvent.click(publishButton());
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.publishTranslationProfile).toHaveBeenCalledOnce();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    view.rerender(<TranslationWorkspace userId="bob" />);
    await screen.findByRole('button', { name: 'Save draft' });
    await act(async () => {
      finishReload(profile({ generation: 4 }));
    });
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('region', { name: 'Published revision confirmed' })).toBeNull();
    expect(readCheckpoint(localStorage, 'bob')).toBeNull();
  });

  it.each([new Error('Network Error'), { response: { status: 502 } }])(
    'can explicitly reload an unknown outcome without another publish, then edit the authoritative generation: %j',
    async (failure) => {
      await openValidated();
      requests.publishTranslationProfile.mockRejectedValueOnce(failure);
      fireEvent.click(publishButton());
      await screen.findByRole('button', { name: 'Retry publication' });
      requests.getTranslationProfile.mockResolvedValue(profile({ generation: 4 }));
      fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
      await screen.findByText('Generation 4 · draft');
      expect(screen.queryByRole('button', { name: 'Retry publication' })).toBeNull();
      expect(publishButton().disabled).toBe(true);
      expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false);
      expect(requests.publishTranslationProfile).toHaveBeenCalledOnce();
    },
  );

  it('clears confirmed publication and validation on opening a different draft', async () => {
    await openValidated();
    requests.getTranslationProfile.mockResolvedValue(profile({ generation: 4 }));
    fireEvent.click(publishButton());
    await screen.findByText('Generation 4 · draft');
    expect(screen.getByRole('region', { name: 'Published revision confirmed' })).toBeTruthy();
    requests.listTranslationProfiles.mockResolvedValue([
      profile({ id: 'ifct_other', name: 'Other' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    const other = await screen.findByRole('button', { name: /Other Draft/ });
    requests.getTranslationProfile.mockResolvedValue(profile({ id: 'ifct_other', name: 'Other' }));
    fireEvent.click(other);
    await waitFor(() =>
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Other'),
    );
    expect(screen.queryByRole('region', { name: 'Published revision confirmed' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    expect(publishButton().disabled).toBe(true);
  });

  it('shows persisted latest revision on reopen without publishing and clears it when switching drafts', async () => {
    requests.getTranslationProfile.mockResolvedValue(
      profile({
        revision_refs: [
          {
            revision_id: 'stored-revision',
            draft_generation: 2,
            content_digest: 'sha256:stored',
            published_at: '2026-10-26T11:00:00Z',
          },
        ],
      }),
    );
    render(<TranslationWorkspace userId="alice" />);
    const summary = await screen.findByRole('region', { name: 'Latest published revision' });
    expect(within(summary).getByText('stored-revision')).toBeTruthy();
    expect(within(summary).getByText('Draft generation 2')).toBeTruthy();
    expect(requests.publishTranslationProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'New draft' }));
    expect(screen.queryByRole('region', { name: 'Latest published revision' })).toBeNull();
  });
});
