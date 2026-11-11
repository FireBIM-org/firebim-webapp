// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requests = vi.hoisted(() => ({
  listTranslationProfiles: vi.fn(),
  getTranslationProfile: vi.fn(),
  createTranslationProfile: vi.fn(),
  updateTranslationProfile: vi.fn(),
  archiveTranslationProfile: vi.fn(),
  validateTranslationProfile: vi.fn(),
  extractTranslationMappings: vi.fn(),
}));
const navigation = vi.hoisted(() => ({
  asPath: '/lexicon/standards',
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  ...requests,
}));
vi.mock('next/router', () => ({ useRouter: () => navigation }));
vi.mock('@/features/ontologies/library', () => ({
  getOntologyLibrary: () => [{ ontology_family: 'fbo', country: 'core', version: 'latest' }],
  refreshOntologyLibrary: async () => [
    { ontology_family: 'fbo', country: 'core', version: 'latest' },
  ],
}));

import type { TranslationProfile, TranslationValidationReport } from './types';

import { emptyDraft, readCheckpoint, writeCheckpoint } from './draft';
import TranslationWorkspace from './TranslationWorkspace';

function record(overrides: Partial<TranslationProfile> = {}): TranslationProfile {
  return {
    id: 'ifct_pilot',
    name: 'Pilot',
    kind: 'ifc_translation',
    status: 'draft',
    generation: 1,
    description: null,
    contract: emptyDraft().contract,
    created_at: '2026-10-23T12:00:00Z',
    updated_at: '2026-10-23T12:00:00Z',
    revision_refs: [],
    ...overrides,
  };
}

function validationReport(
  overrides: Partial<TranslationValidationReport> = {},
): TranslationValidationReport {
  return {
    profile_id: 'ifct_pilot',
    generation: 1,
    authoring_valid: false,
    runtime_available: false,
    publish_ready: false,
    steps: [
      { id: 'destination_ontologies', status: 'passed', message: 'Pinned modules resolved.' },
      { id: 'mappings', status: 'failed', message: 'Mapping envelope or review errors found.' },
      { id: 'publication', status: 'failed', message: 'Authoring checks must pass.' },
    ],
    diagnostics: [
      {
        code: 'mapping_not_accepted',
        severity: 'error',
        mapping_id: 'rating',
        field_path: 'mappings[0].review_state',
        message: 'The enabled mapping must be accepted.',
      },
      {
        code: 'limited_coverage',
        severity: 'warning',
        mapping_id: null,
        field_path: 'contract',
        message: 'Checks cover bounded IFC4 selectors and typed assertions, not upload execution.',
      },
      {
        code: 'runtime_unavailable',
        severity: 'info',
        mapping_id: null,
        field_path: 'publication',
        message: 'Upload results cannot be produced.',
      },
    ],
    ...overrides,
  };
}

function inputName(name: string) {
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: name } });
}

async function ready() {
  await screen.findByRole('button', { name: 'Save draft' });
}

describe('standards-first translation workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    requests.listTranslationProfiles.mockResolvedValue([]);
    requests.getTranslationProfile.mockResolvedValue(record());
    requests.createTranslationProfile.mockResolvedValue(record());
    requests.updateTranslationProfile.mockResolvedValue(record({ generation: 2 }));
    requests.archiveTranslationProfile.mockResolvedValue(
      record({ status: 'archived', generation: 2 }),
    );
    requests.validateTranslationProfile.mockResolvedValue(validationReport());
    requests.extractTranslationMappings.mockImplementation(async (profile_id, generation) => ({
      profile_id,
      generation,
      mappings: [],
      skipped_existing: 0,
      diagnostics: [],
    }));
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an incomplete zero-rule draft even when list discovery fails', async () => {
    requests.listTranslationProfiles.mockRejectedValue(new Error('Offline'));
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    await screen.findByText(/Could not load drafts/);
    inputName('Pilot');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 1/);
    expect(requests.createTranslationProfile).toHaveBeenCalledWith({
      name: 'Pilot',
      description: null,
      contract: emptyDraft().contract,
    });
    expect(readCheckpoint(localStorage, 'alice')).toBe('ifct_pilot');
    expect(
      (screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText(/Upload execution is unavailable and does not block publication/),
    ).toBeTruthy();
  });

  it('adds explicitly versioned module identities and unresolved, disabled mapping drafts', async () => {
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    inputName('Pilot');
    fireEvent.change(screen.getByLabelText('Use a library identity'), {
      target: { value: 'fbo/core' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add unresolved mapping' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(requests.createTranslationProfile).toHaveBeenCalledOnce());
    const payload = requests.createTranslationProfile.mock.calls[0][0];
    expect(payload.contract.destination_modules).toEqual([
      { family: 'fbo', country: 'core', version: '2026.09.04', dependencies: [] },
    ]);
    expect(payload.contract.mappings).toEqual([
      { id: 'mapping-1', enabled: false, review_state: 'unresolved', definition: {} },
    ]);
  });

  it('allows validation only after saving and disables it again for unsaved input', async () => {
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    const validate = screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement;
    expect(validate.disabled).toBe(true);
    expect(screen.getByText(/Save the draft before validating/)).toBeTruthy();
    fireEvent.click(validate);
    inputName('Pilot');
    fireEvent.click(validate);
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 1/);
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await waitFor(() =>
      expect(requests.validateTranslationProfile).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 1),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false),
    );

    inputName('Local edits');
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Save the draft before validating/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    expect(requests.validateTranslationProfile).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'shows saved-generation results without treating authoring_valid=%s as execution readiness',
    async (authoringValid) => {
      writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
      requests.getTranslationProfile.mockResolvedValue(record({ generation: 7 }));
      requests.validateTranslationProfile.mockResolvedValue(
        validationReport({
          generation: 7,
          authoring_valid: authoringValid,
          publish_ready: authoringValid,
          steps: [
            { id: 'destination_ontologies', status: 'passed', message: 'Pinned modules resolved.' },
            {
              id: 'mappings',
              status: authoringValid ? 'passed' : 'failed',
              message: 'Saved mapping checks complete.',
            },
            {
              id: 'publication',
              status: authoringValid ? 'passed' : 'failed',
              message: 'Publication follows authoring validity.',
            },
          ],
        }),
      );
      render(<TranslationWorkspace userId="alice" />);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));

      const report = await screen.findByRole('region', { name: 'Draft checks' });
      expect(within(report).getByText('Saved draft · Generation 7')).toBeTruthy();
      expect(
        within(report).getByText(
          authoringValid ? 'Authoring checks passed.' : 'Draft checks incomplete or failed.',
        ),
      ).toBeTruthy();
      expect(within(report).getByText('Destination ontologies: passed')).toBeTruthy();
      expect(
        within(report).getByText(`Mappings: ${authoringValid ? 'passed' : 'failed'}`),
      ).toBeTruthy();
      expect(
        within(report).getByText(`Publication: ${authoringValid ? 'passed' : 'failed'}`),
      ).toBeTruthy();
      expect(
        within(report).getByText(/Upload execution is unavailable and does not block publication/),
      ).toBeTruthy();
      expect(within(report).getByText('Publication follows authoring validity.')).toBeTruthy();
      const diagnostic = within(report)
        .getByText('The enabled mapping must be accepted.')
        .closest('li')!;
      expect(within(diagnostic).getByText('Mapping rating')).toBeTruthy();
      expect(within(diagnostic).getByText('mappings[0].review_state')).toBeTruthy();
      expect(within(diagnostic).getByText('error · mapping_not_accepted')).toBeTruthy();
      expect(within(report).getByText('warning · limited_coverage')).toBeTruthy();
      expect(within(report).getByText('info · runtime_unavailable')).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement).disabled,
      ).toBe(!authoringValid);
      expect(
        screen.getByText(/bounded IFC4 mapping compilation, not runtime coverage/),
      ).toBeTruthy();
      expect(screen.queryByText(/Unsaved changes/)).toBeNull();
      expect(requests.createTranslationProfile).not.toHaveBeenCalled();
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
      expect(requests.archiveTranslationProfile).not.toHaveBeenCalled();
    },
  );

  it.each([
    { code: 'mapping_selector_unsupported', message: 'Unsupported IFC4 selector: IfcUnsupported.' },
    {
      code: 'mapping_wildcard_unsupported',
      message: 'Wildcard IFC4 selectors are unsupported: IfcWall*.',
    },
    {
      code: 'mapping_fire_resistance_unsupported',
      message: 'Fire-resistance conversion is unsupported: REI60.',
    },
  ])('shows $code unchanged without changing saved pins or mappings', async ({ code, message }) => {
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.getTranslationProfile.mockResolvedValue(
      record({
        contract: {
          ...emptyDraft().contract,
          destination_modules: [
            { family: 'fbo', country: 'core', version: 'latest', dependencies: [] },
          ],
          mappings: [
            {
              id: 'rating',
              enabled: true,
              review_state: 'accepted',
              definition: { language: 'ifc4-mapping/1', unsupported: '*' },
            },
          ],
        },
      }),
    );
    requests.validateTranslationProfile.mockResolvedValue(
      validationReport({
        steps: [
          {
            id: 'destination_ontologies',
            status: 'passed',
            message: 'Release integrity and dependency closure verified.',
          },
          {
            id: 'mappings',
            status: 'failed',
            message: 'Mapping compilation failed.',
          },
          { id: 'publication', status: 'failed', message: 'Authoring checks must pass.' },
        ],
        diagnostics: [
          {
            code,
            severity: 'error',
            mapping_id: 'rating',
            field_path: 'mappings[0].definition',
            message,
          },
          {
            code: 'ontology_retention_unavailable',
            severity: 'warning',
            mapping_id: null,
            field_path: 'destination_modules',
            message: 'Resolved ontology artifacts are not retained by draft checks.',
          },
        ],
      }),
    );
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    await waitFor(() => expect(screen.queryByText('Loading ontology library…')).toBeNull());
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    const pinsBefore = screen
      .getByRole('heading', { name: 'Destination modules' })
      .closest('section')!.textContent;
    const mappingsBefore = (
      screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement
    ).value;
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));

    const dialog = await screen.findByRole('dialog', { name: 'Disable failing mappings?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep mappings enabled' }));
    const report = await screen.findByRole('region', { name: 'Draft checks' });
    expect(within(report).getByText('Draft checks incomplete or failed.')).toBeTruthy();
    expect(within(report).getByText('Mappings: failed')).toBeTruthy();
    expect(within(report).getByText('Mapping compilation failed.')).toBeTruthy();
    const diagnostic = within(report).getByText(message).closest('li')!;
    expect(within(diagnostic).getByText('Mapping rating')).toBeTruthy();
    expect(within(diagnostic).getByText('mappings[0].definition')).toBeTruthy();
    expect(within(diagnostic).getByText(`error · ${code}`)).toBeTruthy();
    expect(
      within(report).getByText('Resolved ontology artifacts are not retained by draft checks.'),
    ).toBeTruthy();
    expect(within(report).getByText(/Publication requires valid authoring checks/)).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Destination modules' }).closest('section')!.textContent,
    ).toBe(pinsBefore);
    expect(
      (screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement).value,
    ).toBe(mappingsBefore);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    expect(requests.createTranslationProfile).not.toHaveBeenCalled();
  });

  it('reopens the server record and saves using its generation, preserving opaque content', async () => {
    const contract = {
      ...emptyDraft().contract,
      mappings: [
        {
          id: 'rating',
          enabled: false,
          review_state: 'unresolved' as const,
          definition: { value: 'REI60' },
          seed_provenance: { origin: 'seed' },
        },
      ],
    };
    const stored = record({ generation: 7, contract });
    requests.listTranslationProfiles.mockResolvedValue([stored]);
    requests.getTranslationProfile.mockResolvedValue(stored);
    requests.updateTranslationProfile.mockResolvedValue(
      record({ generation: 8, contract, name: 'Edited' }),
    );
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: /Pilot Draft/ }));
    await screen.findByText(/Generation 7 · draft/);
    inputName('Edited');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 8/);
    expect(requests.updateTranslationProfile).toHaveBeenCalledWith('ifct_pilot', {
      expected_generation: 7,
      name: 'Edited',
      description: null,
      contract,
    });
  });

  it.each(['name', 'description', 'modules', 'mappings'])(
    'invalidates the report on %s edits, even if reverted',
    async (field) => {
      writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
      render(<TranslationWorkspace userId="alice" />);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      await screen.findByRole('region', { name: 'Draft checks' });

      if (field === 'modules') {
        fireEvent.change(screen.getByLabelText('Use a library identity'), {
          target: { value: 'fbo/core' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
        expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Remove fbo/core' }));
      } else {
        const label =
          field === 'name'
            ? 'Profile name'
            : field === 'description'
              ? 'Description (optional)'
              : 'Mapping definitions (JSON array)';
        const input = screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
        const original = input.value;
        fireEvent.change(input, {
          target: { value: field === 'mappings' ? '[broken' : 'Local edit' },
        });
        expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
        fireEvent.change(input, { target: { value: original } });
      }
      expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    },
  );

  it.each(['save', 'reload', 'open', 'new', 'archive'])(
    'clears the report immediately on %s',
    async (action) => {
      writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
      const other = record({ id: 'ifct_other', name: 'Other' });
      requests.listTranslationProfiles.mockResolvedValue([record(), other]);
      render(<TranslationWorkspace userId="alice" />);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      await screen.findByRole('region', { name: 'Draft checks' });
      const failure = { response: { status: 502, data: { detail: 'Storage unavailable' } } };
      requests.getTranslationProfile.mockRejectedValue(failure);
      requests.updateTranslationProfile.mockRejectedValue(failure);
      requests.archiveTranslationProfile.mockRejectedValue(failure);

      if (action === 'save') {
        fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
      } else {
        const name =
          action === 'reload'
            ? 'Reload server draft'
            : action === 'open'
              ? /Other Draft/
              : action === 'new'
                ? 'New draft'
                : 'Archive draft';
        fireEvent.click(screen.getByRole('button', { name }));
      }
      expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
      if (action !== 'new') {
        await screen.findByRole('alert');
        expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Pilot');
        expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
      }
    },
  );

  it.each([{ generation: 2 }, { profile_id: 'ifct_other' }])(
    'rejects a report that does not match the saved draft: %j',
    async (mismatch) => {
      writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
      requests.validateTranslationProfile.mockResolvedValue(validationReport(mismatch));
      render(<TranslationWorkspace userId="alice" />);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        expect.stringContaining('Validation report does not match the saved draft'),
      );
      expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Pilot');
    },
  );

  it.each([404, 409, 502])(
    'clears earlier checks on validation failure %s without replacing the saved editor',
    async (status) => {
      writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
      render(<TranslationWorkspace userId="alice" />);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      await screen.findByRole('region', { name: 'Draft checks' });
      requests.validateTranslationProfile.mockRejectedValue({
        response: { status, data: { detail: 'Saved draft checks unavailable' } },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));

      expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        expect.stringContaining('Saved draft checks unavailable'),
      );
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Pilot');
      expect(
        (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
      ).toBe(false);
      inputName('Preserved local edits');
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe(
        'Preserved local edits',
      );
      expect(requests.validateTranslationProfile).toHaveBeenCalledTimes(2);
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    },
  );

  it('locks draft actions during validation and discards a late report after changing accounts', async () => {
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    let finish!: (value: TranslationValidationReport) => void;
    requests.validateTranslationProfile.mockReturnValue(
      new Promise<TranslationValidationReport>((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<TranslationWorkspace key="alice" userId="alice" />);
    await ready();
    const validate = screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement;
    fireEvent.click(validate);
    expect(validate.disabled).toBe(true);
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'New draft' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Reload server draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Archive draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(validate);
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.validateTranslationProfile).toHaveBeenCalledOnce();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();

    view.rerender(<TranslationWorkspace key="bob" userId="bob" />);
    await ready();
    await act(async () => {
      finish(validationReport());
    });
    expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('');
    expect(readCheckpoint(localStorage, 'bob')).toBeNull();
  });

  it('retains local edits on a stale save and only reloads after discard confirmation', async () => {
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.updateTranslationProfile.mockRejectedValue({
      response: { status: 409, data: { detail: 'The draft changed' } },
    });
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    inputName('Local edits');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Keep a copy of your local edits/);
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Local edits');
    expect(requests.updateTranslationProfile).toHaveBeenCalledOnce();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    expect(requests.getTranslationProfile).toHaveBeenCalledOnce();
    requests.getTranslationProfile.mockResolvedValue(
      record({ name: 'Server edits', generation: 3 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe(
        'Server edits',
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('restores only a user-scoped pointer and always fetches the authoritative server draft', async () => {
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.getTranslationProfile.mockResolvedValue(
      record({ name: 'Current server name', generation: 5 }),
    );
    const view = render(<TranslationWorkspace key="bob" userId="bob" />);
    await ready();
    expect(requests.getTranslationProfile).not.toHaveBeenCalled();
    view.rerender(<TranslationWorkspace key="alice" userId="alice" />);
    await ready();
    expect(requests.getTranslationProfile).toHaveBeenCalledWith('ifct_pilot');
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe(
      'Current server name',
    );
    expect(screen.getByText(/Generation 5 · draft/)).toBeTruthy();
  });

  it('does not overwrite another user checkpoint when an old account save finishes', async () => {
    let finish!: (value: TranslationProfile) => void;
    requests.createTranslationProfile.mockReturnValue(
      new Promise<TranslationProfile>((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<TranslationWorkspace key="alice" userId="alice" />);
    await ready();
    inputName('Pilot');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    view.rerender(<TranslationWorkspace key="bob" userId="bob" />);
    await ready();
    await act(async () => {
      finish(record());
    });
    expect(readCheckpoint(localStorage, 'alice')).toBeNull();
    expect(readCheckpoint(localStorage, 'bob')).toBeNull();
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('');
  });

  it('keeps invalid mapping text intact and does not send it to the API', async () => {
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    inputName('Pilot');
    fireEvent.change(screen.getByLabelText('Mapping definitions (JSON array)'), {
      target: { value: '[broken' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Mappings must be valid JSON/);
    expect(requests.createTranslationProfile).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement).value,
    ).toBe('[broken');
  });

  it('keeps a newly saved draft in the list when an older list request finishes late', async () => {
    let finishList!: (value: TranslationProfile[]) => void;
    requests.listTranslationProfiles.mockReturnValue(
      new Promise<TranslationProfile[]>((resolve) => {
        finishList = resolve;
      }),
    );
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    inputName('Pilot');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 1/);
    await act(async () => {
      finishList([]);
    });
    expect(screen.getByRole('button', { name: /Pilot Draft/ })).toBeTruthy();
  });

  it('locks editing and prevents duplicate creates while saving', async () => {
    let finish!: (value: TranslationProfile) => void;
    requests.createTranslationProfile.mockReturnValue(
      new Promise<TranslationProfile>((resolve) => {
        finish = resolve;
      }),
    );
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    inputName('Pilot');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
    expect(requests.createTranslationProfile).toHaveBeenCalledOnce();
    await act(async () => {
      finish(record());
    });
    await screen.findByText(/Saved draft generation 1/);
  });

  it('archives with the current generation without deleting the saved contract', async () => {
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.listTranslationProfiles.mockResolvedValue([record()]);
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Archive draft' }));
    await screen.findByText(/Draft archived/);
    expect(requests.archiveTranslationProfile).toHaveBeenCalledWith('ifct_pilot', 1);
    expect(readCheckpoint(localStorage, 'alice')).toBeNull();
    expect(screen.queryByRole('button', { name: /Pilot Draft/ })).toBeNull();
  });

  it('shows archived records as read-only if another session archived the restored draft', async () => {
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    requests.getTranslationProfile.mockResolvedValue(record({ status: 'archived' }));
    render(<TranslationWorkspace userId="alice" />);
    await screen.findByText(/archived and is read-only/);
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();
  });

  it('warns before discarding or navigating away from unsaved work', async () => {
    render(<TranslationWorkspace userId="alice" />);
    await ready();
    inputName('Unsaved');
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'New draft' }));
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Unsaved');
    const handler = navigation.events.on.mock.calls.find(
      ([event]) => event === 'routeChangeStart',
    )?.[1];
    let cancellation: unknown;
    try {
      handler('/lexicon');
    } catch (failure) {
      cancellation = failure;
    }
    expect(cancellation).toMatchObject({ cancelled: true });
    expect(navigation.events.emit).toHaveBeenCalledWith(
      'routeChangeError',
      cancellation,
      '/lexicon',
      { shallow: false },
    );
    const expectedRejection = Object.assign(new Event('unhandledrejection', { cancelable: true }), {
      reason: cancellation,
      promise: Promise.resolve(),
    });
    window.dispatchEvent(expectedRejection);
    expect(expectedRejection.defaultPrevented).toBe(true);
    const unexpectedRejection = Object.assign(
      new Event('unhandledrejection', { cancelable: true }),
      {
        reason: new Error('Unrelated failure'),
        promise: Promise.resolve(),
      },
    );
    window.dispatchEvent(unexpectedRejection);
    expect(unexpectedRejection.defaultPrevented).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
