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
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  ...requests,
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/lexicon/standards', events: { on: vi.fn(), off: vi.fn() } }),
}));
vi.mock('@/features/ontologies/library', () => ({
  getOntologyLibrary: () => [{ ontology_family: 'fbo', country: 'core', version: 'latest' }],
  refreshOntologyLibrary: async () => [
    { ontology_family: 'fbo', country: 'core', version: 'latest' },
  ],
}));

import type {
  TranslationDraftMapping,
  TranslationMappingExtractionReport,
  TranslationProfile,
} from './types';

import { emptyDraft, writeCheckpoint } from './draft';
import TranslationWorkspace from './TranslationWorkspace';

const existing: TranslationDraftMapping = {
  id: 'manual',
  enabled: true,
  review_state: 'accepted',
  definition: { raw_value: 'REI60', opaque: [null, false, { custom: 1 }] },
};
const suggestion: TranslationDraftMapping = {
  id: 'module-wall',
  enabled: false,
  review_state: 'suggestion',
  seed_provenance: {
    kind: 'ontology_module',
    module: { family: 'fbo', country: 'core', version: '2026.09.04', sha256: 'abc123' },
    declaration_iri: 'https://example.test/declaration',
    target_iri: 'https://example.test/Wall',
  },
  definition: {
    language: 'fbo-module-suggestion/1',
    source: { schema: 'IFC4', raw_value: 'IfcWall' },
    target: { iri: 'https://example.test/Wall', kind: 'class', ranges: [] },
    declaration: { iri: 'https://example.test/declaration', statements: [] },
    review_issues: ['Check the source declaration.'],
  },
};
function profile(overrides: Partial<TranslationProfile> = {}): TranslationProfile {
  return {
    id: 'ifct_pilot',
    name: 'Pilot',
    kind: 'ifc_translation',
    status: 'draft',
    generation: 1,
    created_at: '2026-10-23',
    updated_at: '2026-10-23',
    revision_refs: [],
    contract: {
      ...emptyDraft().contract,
      destination_modules: [
        { family: 'fbo', country: 'core', version: '2026.09.04', dependencies: [] },
      ],
      mappings: [existing],
    },
    ...overrides,
  };
}
function report(
  overrides: Partial<TranslationMappingExtractionReport> = {},
): TranslationMappingExtractionReport {
  return {
    profile_id: 'ifct_pilot',
    generation: 1,
    mappings: [suggestion],
    skipped_existing: 1,
    diagnostics: [],
    ...overrides,
  };
}
function mappingText() {
  return (screen.getByLabelText('Mapping definitions (JSON array)') as HTMLTextAreaElement).value;
}
async function openSaved() {
  writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
  const view = render(<TranslationWorkspace userId="alice" />);
  await waitFor(() =>
    expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false),
  );
  return view;
}

describe('module mapping extraction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    requests.listTranslationProfiles.mockResolvedValue([]);
    requests.getTranslationProfile.mockResolvedValue(profile());
    requests.extractTranslationMappings.mockResolvedValue(report());
    requests.updateTranslationProfile.mockImplementation(async (_id, payload) =>
      profile({ ...payload, generation: 2 }),
    );
    requests.archiveTranslationProfile.mockResolvedValue(
      profile({ status: 'archived', generation: 2 }),
    );
    requests.validateTranslationProfile.mockResolvedValue({
      profile_id: 'ifct_pilot',
      generation: 1,
      authoring_valid: false,
      runtime_available: false,
      publish_ready: false,
      steps: [],
      diagnostics: [],
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('appends disabled suggestions without changing existing entries, then saves only explicitly', async () => {
    await openSaved();
    const result = await screen.findByRole('region', { name: 'Module extraction' });
    expect(requests.extractTranslationMappings).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 1);
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
    expect(result.textContent).toContain('1 new module mapping');
    expect(result.textContent).toContain('1 existing');
    expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load mappings from modules' })).toBeNull();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    const toggle = screen.getByText('Module mapping summaries');
    const accordion = toggle.closest('details')!;
    expect(accordion).not.toBeNull();
    expect(accordion.open).toBe(false);
    fireEvent.click(toggle);
    expect(accordion.open).toBe(true);
    const summary = screen.getByRole('region', { name: 'Module mapping summaries' });
    expect(summary.textContent).toContain('https://example.test/Wall');
    expect(summary.textContent).toContain('class');
    expect(summary.textContent).toContain('suggestion');
    expect(summary.textContent).toContain('abc123');
    expect(summary.textContent).toContain('Check the source declaration.');
    expect(
      (screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    requests.extractTranslationMappings.mockResolvedValue(
      report({ generation: 2, mappings: [], skipped_existing: 2 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 2/);
    expect(requests.updateTranslationProfile.mock.calls[0][1].contract.mappings).toEqual([
      existing,
      suggestion,
    ]);
    expect(screen.getByRole('region', { name: 'Module mapping summaries' }).textContent).toContain(
      'https://example.test/Wall',
    );
    await screen.findByRole('region', { name: 'Module extraction' });
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(requests.extractTranslationMappings).toHaveBeenCalledTimes(2);
    expect(requests.extractTranslationMappings).toHaveBeenLastCalledWith('ifct_pilot', 2);
    requests.getTranslationProfile.mockResolvedValue(
      profile({
        generation: 2,
        contract: { ...profile().contract, mappings: [existing, suggestion] },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await waitFor(() => expect(requests.extractTranslationMappings).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('region', { name: 'Module mapping summaries' }).textContent).toContain(
      'https://example.test/Wall',
    );
  });

  it('explicitly accepts an imported suggestion, saves its original data, then enables explicit publication after authoring success', async () => {
    const disabledExisting = { ...existing, enabled: false };
    const imported = {
      ...suggestion,
      seed_provenance: { ...suggestion.seed_provenance, custom: { retained: [null, false, 7] } },
      definition: { ...suggestion.definition, custom: { retained: ['opaque', { nested: true }] } },
    };
    requests.getTranslationProfile.mockResolvedValue(
      profile({ contract: { ...profile().contract, mappings: [disabledExisting] } }),
    );
    requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [imported] }));
    requests.validateTranslationProfile.mockResolvedValue({
      profile_id: 'ifct_pilot',
      generation: 2,
      authoring_valid: true,
      runtime_available: false,
      publish_ready: true,
      steps: [
        { id: 'destination_ontologies', status: 'passed', message: 'Pinned modules resolved.' },
        { id: 'mappings', status: 'passed', message: 'Supported IFC4 mappings compiled.' },
        { id: 'publication', status: 'passed', message: 'Ready to publish an immutable revision.' },
      ],
      diagnostics: [],
    });

    await openSaved();
    expect(JSON.parse(mappingText())).toEqual([disabledExisting, imported]);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();
    const accordion = screen.getByText('Module mapping summaries').closest('details')!;
    expect(accordion.open).toBe(false);
    fireEvent.click(screen.getByText('Module mapping summaries'));
    const entry = screen.getByText(imported.id).closest('li')!;
    fireEvent.click(within(entry).getByRole('button', { name: 'Accept and enable' }));

    const accepted = { ...imported, enabled: true, review_state: 'accepted' };
    expect(JSON.parse(mappingText())).toEqual([disabledExisting, accepted]);
    expect(screen.getByText('Unsaved changes. Save explicitly before leaving.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Review choices are not proof/)).toBeTruthy();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();

    requests.extractTranslationMappings.mockResolvedValue(
      report({ generation: 2, mappings: [], skipped_existing: 2 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 2/);
    expect(requests.updateTranslationProfile).toHaveBeenCalledExactlyOnceWith('ifct_pilot', {
      expected_generation: 1,
      name: 'Pilot',
      description: null,
      contract: { ...profile().contract, mappings: [disabledExisting, accepted] },
    });
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    const validation = await screen.findByRole('region', { name: 'Draft checks' });
    expect(within(validation).getByText('Authoring checks passed.')).toBeTruthy();
    expect(within(validation).getByText('Supported IFC4 mappings compiled.')).toBeTruthy();
    expect(
      within(validation).getByText(
        /Upload execution is unavailable and does not block publication/,
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(JSON.parse(mappingText())).toEqual([disabledExisting, accepted]);
    expect(requests.validateTranslationProfile).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 2);
  });

  it('loads new module mappings enabled by default and preserves an existing disabled module mapping after save and reload', async () => {
    const disabled = { ...suggestion, id: 'disabled-module', review_state: 'accepted' as const };
    const enabled = { ...suggestion, enabled: true, review_state: 'accepted' as const };
    requests.getTranslationProfile.mockResolvedValue(
      profile({ contract: { ...profile().contract, mappings: [disabled] } }),
    );
    requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [enabled] }));

    await openSaved();
    expect(JSON.parse(mappingText())).toEqual([disabled, enabled]);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Module mapping summaries').closest('details')!.open).toBe(false);

    requests.extractTranslationMappings.mockResolvedValue(
      report({ generation: 2, mappings: [], skipped_existing: 2 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 2/);
    expect(requests.updateTranslationProfile.mock.calls[0][1].contract.mappings).toEqual([
      disabled,
      enabled,
    ]);
    requests.getTranslationProfile.mockResolvedValue(
      profile({
        generation: 2,
        contract: { ...profile().contract, mappings: [disabled, enabled] },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await waitFor(() => expect(requests.extractTranslationMappings).toHaveBeenCalledTimes(3));
    expect(JSON.parse(mappingText())).toEqual([disabled, enabled]);
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();
  });

  it('recovers saved disabled module imports in one action, then saves before validating the new generation', async () => {
    const manual = { ...existing, enabled: false, review_state: 'unresolved' as const };
    const imports = ['unresolved', 'suggestion', 'rejected', 'accepted'].map(
      (review_state, index) => ({
        ...suggestion,
        id: `saved-module-${index}`,
        review_state: review_state as TranslationDraftMapping['review_state'],
        definition: { ...suggestion.definition, custom: { preserved: [null, false, 'REI60'] } },
      }),
    );
    const mappings = [manual, ...imports];
    requests.getTranslationProfile.mockResolvedValue(
      profile({ generation: 12, contract: { ...profile().contract, mappings } }),
    );
    requests.extractTranslationMappings.mockResolvedValue(
      report({ generation: 12, mappings: [], skipped_existing: mappings.length }),
    );
    requests.validateTranslationProfile.mockResolvedValue({
      profile_id: 'ifct_pilot',
      generation: 12,
      authoring_valid: false,
      runtime_available: false,
      publish_ready: false,
      steps: [],
      diagnostics: [
        {
          code: 'enabled_mappings_required',
          severity: 'error',
          mapping_id: null,
          field_path: 'contract.mappings',
          message:
            'At least one accepted, enabled mapping is required. Disabled definitions are not validated.',
        },
      ],
    });

    await openSaved();
    expect(JSON.parse(mappingText())).toEqual(mappings);
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    await screen.findByRole('region', { name: 'Draft checks' });
    expect(screen.getByText('Module mapping summaries').closest('details')!.open).toBe(false);
    expect(screen.getByText(/4 module mappings are disabled/)).toBeTruthy();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable all module mappings' }));

    const enabled = [
      manual,
      ...imports.map((mapping) => ({ ...mapping, enabled: true, review_state: 'accepted' })),
    ];
    expect(JSON.parse(mappingText())).toEqual(enabled);
    expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
    expect(screen.getByText('Unsaved changes. Save explicitly before leaving.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Enable all module mappings' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    requests.updateTranslationProfile.mockImplementation(async (_id, payload) =>
      profile({ ...payload, generation: 13 }),
    );
    requests.extractTranslationMappings.mockResolvedValue(
      report({ generation: 13, mappings: [], skipped_existing: mappings.length }),
    );
    requests.validateTranslationProfile.mockResolvedValue({
      profile_id: 'ifct_pilot',
      generation: 13,
      authoring_valid: false,
      runtime_available: false,
      publish_ready: false,
      steps: [],
      diagnostics: [
        {
          code: 'module_selector_unsupported',
          severity: 'error',
          mapping_id: imports[0].id,
          field_path: 'contract.mappings[1].definition',
          message: 'This declaration is unsupported.',
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Saved draft generation 13/);
    expect(requests.updateTranslationProfile.mock.calls[0][1].expected_generation).toBe(12);
    expect(requests.updateTranslationProfile.mock.calls[0][1].contract.mappings).toEqual(enabled);
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disable failing mappings?' });
    expect(within(dialog).getByText('This declaration is unsupported.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep mappings enabled' }));
    const checks = await screen.findByRole('region', { name: 'Draft checks' });
    expect(within(checks).getByText('This declaration is unsupported.')).toBeTruthy();
    expect(requests.validateTranslationProfile).toHaveBeenLastCalledWith('ifct_pilot', 13);
    expect(screen.queryByText(/At least one accepted, enabled mapping/)).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Publish revision' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    requests.getTranslationProfile.mockResolvedValue(
      profile({
        generation: 13,
        contract: { ...profile().contract, mappings: enabled as TranslationDraftMapping[] },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await waitFor(() => expect(requests.extractTranslationMappings).toHaveBeenCalledTimes(3));
    expect(JSON.parse(mappingText())).toEqual(enabled);
  });

  it.each(['accepted', 'rejected', 'unresolved', 'suggestion'] as const)(
    'disables a mapping without changing its %s review state or any other mapping',
    async (reviewState) => {
      const reviewed = { ...suggestion, id: 'reviewed', enabled: true, review_state: reviewState };
      const untouched = [
        existing,
        { ...suggestion, id: 'rejected', review_state: 'rejected' as const },
        { ...suggestion, id: 'unresolved', review_state: 'unresolved' as const },
      ];
      const mappings = [reviewed, ...untouched];
      requests.getTranslationProfile.mockResolvedValue(
        profile({ contract: { ...profile().contract, mappings } }),
      );
      requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [] }));
      await openSaved();
      expect(JSON.parse(mappingText())).toEqual(mappings);
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      await screen.findByRole('region', { name: 'Draft checks' });
      fireEvent.click(screen.getByText('Module mapping summaries'));
      const entry = screen.getByText('reviewed').closest('li')!;
      fireEvent.click(within(entry).getByRole('button', { name: 'Disable mapping' }));

      const disabled = [{ ...reviewed, enabled: false }, ...untouched];
      expect(JSON.parse(mappingText())).toEqual(disabled);
      expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
      expect(screen.getByText('Unsaved changes. Save explicitly before leaving.')).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Validate draft' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
      requests.extractTranslationMappings.mockResolvedValue(
        report({ generation: 2, mappings: [] }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      await screen.findByText(/Saved draft generation 2/);
      expect(requests.updateTranslationProfile.mock.calls[0][1].contract.mappings).toEqual(
        disabled,
      );
      expect(requests.validateTranslationProfile).toHaveBeenCalledOnce();
    },
  );

  it.each(['rejected', 'unresolved'] as const)(
    'leaves a %s suggestion untouched until explicit acceptance and invalidates the old report',
    async (reviewState) => {
      const reviewed = { ...suggestion, review_state: reviewState };
      const mappings = [existing, reviewed];
      requests.getTranslationProfile.mockResolvedValue(
        profile({ contract: { ...profile().contract, mappings } }),
      );
      requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [] }));
      await openSaved();
      expect(JSON.parse(mappingText())).toEqual(mappings);
      fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      await screen.findByRole('region', { name: 'Draft checks' });
      expect(JSON.parse(mappingText())).toEqual(mappings);
      fireEvent.click(screen.getByText('Module mapping summaries'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept and enable' }));
      expect(JSON.parse(mappingText())).toEqual([
        existing,
        { ...reviewed, enabled: true, review_state: 'accepted' },
      ]);
      expect(screen.queryByRole('region', { name: 'Draft checks' })).toBeNull();
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
      expect(requests.validateTranslationProfile).toHaveBeenCalledOnce();
    },
  );

  it('preserves original IDs and omitted fields on other entries during review', async () => {
    const untouched = { id: '  incomplete  ', definition: { opaque: [null, false] } };
    const reviewed = { ...suggestion, id: '  module-wall  ' };
    requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [] }));
    await openSaved();
    fireEvent.change(screen.getByLabelText('Mapping definitions (JSON array)'), {
      target: { value: JSON.stringify([untouched, reviewed]) },
    });
    fireEvent.click(screen.getByText('Module mapping summaries'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept and enable' }));
    expect(JSON.parse(mappingText())).toEqual([
      untouched,
      { ...reviewed, enabled: true, review_state: 'accepted' },
    ]);
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
  });

  it.each(['[broken', '[{"id":"bad","enabled":"false"}]'])(
    'removes review controls when JSON becomes invalid without replacing the text: %s',
    async (invalid) => {
      await openSaved();
      fireEvent.click(screen.getByText('Module mapping summaries'));
      expect(screen.getByRole('button', { name: 'Accept and enable' })).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Mapping definitions (JSON array)'), {
        target: { value: invalid },
      });
      expect(screen.queryByRole('button', { name: 'Accept and enable' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Disable mapping' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Enable all module mappings' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      await screen.findByRole('alert');
      expect(mappingText()).toBe(invalid);
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    },
  );

  it.each(['saving', 'validating', 'loading modules'])(
    'locks all review actions while %s without changing mappings',
    async (operation) => {
      const mappings = [suggestion, { ...suggestion, id: 'enabled', enabled: true }];
      requests.getTranslationProfile.mockResolvedValue(
        profile({ contract: { ...profile().contract, mappings } }),
      );
      requests.extractTranslationMappings.mockImplementation(async (_id, generation) =>
        report({ generation, mappings: [] }),
      );
      await openSaved();
      fireEvent.click(screen.getByText('Module mapping summaries'));
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      if (operation === 'saving') {
        requests.updateTranslationProfile.mockImplementationOnce(async (_id, payload) => {
          await pending;
          return profile({ ...payload, generation: 2 });
        });
        fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Edited' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      } else if (operation === 'validating') {
        requests.validateTranslationProfile.mockImplementationOnce(async () => {
          await pending;
          return {
            profile_id: 'ifct_pilot',
            generation: 1,
            authoring_valid: false,
            runtime_available: false,
            publish_ready: false,
            steps: [],
            diagnostics: [],
          };
        });
        fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));
      } else {
        requests.extractTranslationMappings.mockImplementationOnce(async () => {
          await pending;
          return report({ mappings: [] });
        });
        fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
      }

      const before = mappingText();
      const actions = screen.getAllByRole('button', {
        name: /Accept and enable|Disable mapping|Enable all module mappings/,
      });
      expect(actions).toHaveLength(5);
      for (const button of actions) {
        expect(button.matches(':disabled')).toBe(true);
        button.click();
      }
      expect(mappingText()).toBe(before);
      await act(async () => finish());
      await waitFor(() =>
        expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false),
      );
      expect(JSON.parse(mappingText())).toEqual(mappings);
    },
  );

  it('locks all review actions for archived drafts', async () => {
    const mappings = [suggestion, { ...suggestion, id: 'enabled', enabled: true }];
    requests.getTranslationProfile.mockResolvedValue(
      profile({ status: 'archived', contract: { ...profile().contract, mappings } }),
    );
    writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
    render(<TranslationWorkspace userId="alice" />);
    await screen.findByText(/archived and is read-only/);
    fireEvent.click(screen.getByText('Module mapping summaries'));
    const before = mappingText();
    const actions = screen.getAllByRole('button', {
      name: /Accept and enable|Disable mapping|Enable all module mappings/,
    });
    expect(actions).toHaveLength(5);
    for (const button of actions) {
      expect(button.matches(':disabled')).toBe(true);
      button.click();
    }
    expect(mappingText()).toBe(before);
    expect(requests.extractTranslationMappings).not.toHaveBeenCalled();
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    expect(requests.validateTranslationProfile).not.toHaveBeenCalled();
  });

  it.each(['existing', 'returned'])(
    'leaves editor text intact on a conflicting %s ID',
    async (collision) => {
      requests.extractTranslationMappings.mockResolvedValue(
        report({
          mappings: [
            suggestion,
            collision === 'existing'
              ? { ...suggestion, id: existing.id }
              : { ...suggestion, definition: {} },
          ],
        }),
      );
      await openSaved();
      const before = mappingText();
      expect((await screen.findByRole('alert')).textContent).toContain(
        'conflicting duplicate mapping ID',
      );
      expect(mappingText()).toBe(before);
      expect(screen.queryByRole('region', { name: 'Module extraction' })).toBeNull();
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
    },
  );

  it('renders non-blocking diagnostics while appending suggestions', async () => {
    requests.extractTranslationMappings.mockResolvedValue(
      report({
        diagnostics: [
          {
            code: 'source_unresolved',
            severity: 'warning',
            mapping_id: suggestion.id,
            field_path: 'mappings[0].definition.source',
            message: 'Check the IFC source manually.',
          },
        ],
      }),
    );
    await openSaved();
    const result = await screen.findByRole('region', { name: 'Module extraction' });
    expect(result.textContent).toContain('warning');
    expect(result.textContent).toContain('source_unresolved');
    expect(result.textContent).toContain(suggestion.id);
    expect(result.textContent).toContain('Check the IFC source manually.');
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
  });

  it.each(['new', 'archived', 'no modules'])('does not extract for a %s draft', async (state) => {
    const saved = profile();
    if (state === 'archived') saved.status = 'archived';
    if (state === 'no modules') saved.contract.destination_modules = [];
    requests.getTranslationProfile.mockResolvedValue(saved);
    if (state !== 'new') writeCheckpoint(localStorage, 'alice', saved.id);
    render(<TranslationWorkspace userId="alice" />);
    await screen.findByRole('button', { name: 'Save draft' });
    expect(requests.extractTranslationMappings).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Load mappings from modules' })).toBeNull();
  });

  it('loads mappings after saving newly selected modules, not while editing them', async () => {
    requests.getTranslationProfile.mockResolvedValue(
      profile({ contract: { ...profile().contract, destination_modules: [] } }),
    );
    await openSaved();
    fireEvent.change(screen.getByLabelText('Use a library identity'), {
      target: { value: 'fbo/core' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(requests.extractTranslationMappings).not.toHaveBeenCalled();
    requests.extractTranslationMappings.mockResolvedValue(report({ generation: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('region', { name: 'Module extraction' });
    expect(requests.extractTranslationMappings).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 2);
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
    expect(requests.updateTranslationProfile).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Edited name' } });
    expect(requests.extractTranslationMappings).toHaveBeenCalledOnce();
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
  });

  it('loads mappings automatically after creating a draft with modules', async () => {
    requests.createTranslationProfile.mockResolvedValue(profile());
    render(<TranslationWorkspace userId="alice" />);
    await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Pilot' } });
    fireEvent.change(screen.getByLabelText('Use a library identity'), {
      target: { value: 'fbo/core' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(requests.extractTranslationMappings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('region', { name: 'Module extraction' });
    expect(requests.extractTranslationMappings).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 1);
    expect(requests.createTranslationProfile).toHaveBeenCalledOnce();
    expect(requests.createTranslationProfile.mock.calls[0][0].contract.destination_modules).toEqual(
      profile().contract.destination_modules,
    );
    expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
  });

  it('automatically loads mappings when selecting another saved draft', async () => {
    requests.listTranslationProfiles.mockResolvedValue([profile()]);
    render(<TranslationWorkspace userId="alice" />);
    fireEvent.click(await screen.findByRole('button', { name: /Pilot.*Generation 1/ }));
    await screen.findByRole('region', { name: 'Module extraction' });
    expect(requests.extractTranslationMappings).toHaveBeenCalledExactlyOnceWith('ifct_pilot', 1);
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
  });

  it('shows blocking module diagnostics without importing any suggestions', async () => {
    requests.extractTranslationMappings.mockResolvedValue(
      report({
        mappings: [],
        diagnostics: [
          {
            code: 'module_integrity',
            severity: 'error',
            mapping_id: null,
            field_path: 'destination_modules[0].sha256',
            message: 'Module checksum mismatch.',
          },
        ],
      }),
    );
    await openSaved();
    const before = mappingText();
    const result = await screen.findByRole('region', { name: 'Module extraction' });
    expect(within(result).getByText('Module checksum mismatch.')).toBeTruthy();
    expect(result.textContent).toContain('module_integrity');
    expect(result.textContent).toContain('destination_modules[0].sha256');
    expect(result.textContent).toContain('No suggestions loaded');
    expect(mappingText()).toBe(before);
  });

  it('fails closed even if a blocking report incorrectly includes mappings', async () => {
    requests.extractTranslationMappings.mockResolvedValue(
      report({
        diagnostics: [
          {
            code: 'dependency_missing',
            severity: 'error',
            mapping_id: null,
            field_path: 'destination_modules',
            message: 'Dependency missing.',
          },
        ],
      }),
    );
    await openSaved();
    const before = mappingText();
    await screen.findByText('Dependency missing.');
    expect(mappingText()).toBe(before);
    expect(screen.queryByRole('region', { name: 'Module mapping summaries' })).toBeNull();
  });

  it.each([{ generation: 9 }, { profile_id: 'ifct_other' }])(
    'rejects mismatched extraction reports: %j',
    async (mismatch) => {
      requests.extractTranslationMappings.mockResolvedValue(report(mismatch));
      await openSaved();
      const before = mappingText();
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Extraction report does not match',
      );
      expect(mappingText()).toBe(before);
      expect(screen.queryByRole('region', { name: 'Module extraction' })).toBeNull();
    },
  );

  it.each([401, 403, 409, 502])(
    'preserves editor JSON on extraction failure %s',
    async (status) => {
      requests.extractTranslationMappings.mockRejectedValue({
        response: { status, data: { detail: 'Extraction unavailable' } },
      });
      await openSaved();
      const before = mappingText();
      await screen.findByRole('alert');
      expect(mappingText()).toBe(before);
      expect(JSON.parse(mappingText())).toEqual([existing]);
      expect(screen.queryByRole('region', { name: 'Module extraction' })).toBeNull();
    },
  );

  it('keeps a successful save when automatic loading fails and retries only on reload', async () => {
    requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [] }));
    await openSaved();
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Saved name' } });
    requests.extractTranslationMappings.mockRejectedValue({
      response: { status: 502, data: { detail: 'Module service unavailable' } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('Could not automatically load module mappings');
    expect(error.textContent).toContain('Module service unavailable');
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Saved name');
    expect(screen.getByText(/Saved draft generation 2/)).toBeTruthy();
    expect(JSON.parse(mappingText())).toEqual([existing]);
    expect(requests.updateTranslationProfile).toHaveBeenCalledOnce();
    expect(requests.extractTranslationMappings).toHaveBeenCalledTimes(2);
    requests.getTranslationProfile.mockResolvedValue(
      profile({ generation: 2, name: 'Saved name' }),
    );
    requests.extractTranslationMappings.mockResolvedValue(report({ generation: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload server draft' }));
    await screen.findByRole('region', { name: 'Module extraction' });
    expect(requests.extractTranslationMappings).toHaveBeenCalledTimes(3);
    expect(requests.extractTranslationMappings).toHaveBeenLastCalledWith('ifct_pilot', 2);
    expect(JSON.parse(mappingText())).toEqual([existing, suggestion]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['change', 'new', 'archive', 'account'])(
    'clears extraction reports on %s',
    async (action) => {
      requests.extractTranslationMappings.mockResolvedValue(report({ mappings: [] }));
      const view = await openSaved();
      await screen.findByRole('region', { name: 'Module extraction' });
      if (action === 'change')
        fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Changed' } });
      if (action === 'new') fireEvent.click(screen.getByRole('button', { name: 'New draft' }));
      if (action === 'archive')
        fireEvent.click(screen.getByRole('button', { name: 'Archive draft' }));
      if (action === 'account') view.rerender(<TranslationWorkspace userId="bob" />);
      expect(screen.queryByRole('region', { name: 'Module extraction' })).toBeNull();
      await waitFor(() =>
        expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(false),
      );
    },
  );

  it.each(['resolve', 'reject'])(
    'locks lifecycle actions and ignores late extraction %s after an account switch',
    async (completion) => {
      let finish!: (value: TranslationMappingExtractionReport) => void;
      let fail!: (error: Error) => void;
      requests.extractTranslationMappings.mockReturnValue(
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      );
      writeCheckpoint(localStorage, 'alice', 'ifct_pilot');
      const view = render(<TranslationWorkspace userId="alice" />);
      await waitFor(() => expect(requests.extractTranslationMappings).toHaveBeenCalledOnce());
      expect(screen.getByLabelText('Profile name').closest('fieldset')?.disabled).toBe(true);
      for (const name of ['New draft', 'Reload server draft', 'Archive draft', 'Validate draft']) {
        expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name }));
      }
      fireEvent.submit(screen.getByLabelText('Profile name').closest('form')!);
      expect(requests.extractTranslationMappings).toHaveBeenCalledOnce();
      expect(requests.updateTranslationProfile).not.toHaveBeenCalled();
      view.rerender(<TranslationWorkspace userId="bob" />);
      await waitFor(() =>
        expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe(''),
      );
      await act(async () => {
        if (completion === 'resolve') finish(report());
        else fail(new Error('Old account failure'));
      });
      expect(mappingText()).toBe('[]');
      expect(screen.queryByRole('region', { name: 'Module extraction' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );
});
